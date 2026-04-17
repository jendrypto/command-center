#!/bin/bash
# Decision Trace CLI Helper
# Usage: ./decision-trace.sh "Title" "Question" "Choice" "Reasoning" [options...]

API_URL_ITEMS="http://localhost:3005/api/items"
API_URL_CONNECTIONS="http://localhost:3005/api/connections"

# Show usage
if [ $# -lt 4 ]; then
    echo "Usage: decision-trace.sh \"Title\" \"Question\" \"Choice Made\" \"Reasoning\" [options...]"
    echo ""
    echo "Examples:"
    echo "  ./decision-trace.sh \"Cron Model\" \"Which model for crons?\" \"Kimi K2.5\" \"Only reliable for multi-step\" --options='[\"option1\",\"option2\"]' --tags='[\"infra\",\"cron\"]' --related='[1,2,3]'"
    echo ""
    echo "Options:"
    echo "  --options='[\"option1\",\""option1\""]'  # JSON array of alternatives"
    echo "  --tags='[\"tag1\",\"tag2\"]'            # JSON array of tags"
    echo "  --related='[1,2,3]'                   # Related item IDs (connect decision to other items)"
    echo "  --status='reference'                # Item status (raw, clustered, candidate, promoted, reference, archived)"
    exit 1
fi

TITLE="$1"
QUESTION="$2"
CHOICE="$3"
REASONING="$4"
shift 4

# Default values
OPTIONS_RAW="[]"
TAGS_RAW="[]"
RELATED="[]"
STATUS="reference"
DECISION_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Parse optional arguments
while [ $# -gt 0 ]; do
    case "$1" in
        --options=*)
            OPTIONS_RAW="${1#*=}"
            ;;
        --tags=*)
            TAGS_RAW="${1#*=}"
            ;;
        --related=*)
            RELATED="${1#*=}"
            ;;
        --status=*)
            STATUS="${1#*=}"
            ;;
    esac
    shift
done

# Truncate CHOICE for summary if > 100 chars
CHOICE_SUMMARY="$CHOICE"
if [ ${#CHOICE} -gt 100 ]; then
  CHOICE_SUMMARY="${CHOICE:0:100}..."
fi

# Build content object with all decision fields (ensuring proper JSON escaping for values)
CONTENT_JSON_ESCAPED=$(jq -n \
  --arg question "$QUESTION" \
  --argjson options "$OPTIONS_RAW" \
  --arg choice "$CHOICE" \
  --arg reasoning "$REASONING" \
  --arg decision_date "$DECISION_DATE" \
  '{question: $question, options_considered: $options, choice_made: $choice, reasoning: $reasoning, decision_date: $decision_date, outcome: null, outcome_date: null, superseded_by: null}')

# Prepare tags with default decision-trace tag
# Ensure TAGS_RAW is a valid JSON array before adding 'decision-trace'
if [ "$TAGS_RAW" == "" ] || [ "$TAGS_RAW" == "[]" ]; then
  ALL_TAGS_JQLINE='["decision-trace"]'.
else
  ALL_TAGS_JQLINE=$(echo "$TAGS_RAW" | jq --compact-output --arg newTag "decision-trace" '. + [$newTag]')
fi

# Build JSON payload for /api/items
ITEM_JSON=$(jq -n \
  --arg title "Decision: $TITLE" \
  --argjson content "$CONTENT_JSON_ESCAPED" \
  --arg category "decisions" \
  --argjson tags "$ALL_TAGS_JQLINE" \
  --arg status "$STATUS" \
  --arg summary "Chose: $CHOICE_SUMMARY" \
  '{title: $title, content: $content, category: $category, tags: $tags, status: $status, summary: $summary}')

# Print ITEM_JSON for debugging
echo "DEBUG: Final ITEM_JSON = $ITEM_JSON"

# Send to API
echo "Capturing decision: $TITLE"
RESPONSE=$(curl -s -X POST "$API_URL_ITEMS" \
    -H 'Content-Type: application/json' \
    -d "$ITEM_JSON")

# Check response
if echo "$RESPONSE" | grep -q '"id"'; then
    DECISION_ID=$(echo "$RESPONSE" | jq -r '.item.id')
    echo "✓ Decision captured successfully (ID: $DECISION_ID)"

    # Create connections for related items if any
    if [ "$RELATED" != "[]" ] && [ "$DECISION_ID" != "null" ]; then
      echo "Creating connections..."
      # Ensure RELATED is a valid JSON array
      if echo "$RELATED" | jq -e . >/dev/null 2>&1; then 
        # iterate over the array elements directly
        for RELATED_ID in $(echo "$RELATED" | jq -r '.[]'); do
          CONNECTION_JSON=$(jq -n \
            --argjson source_id "$DECISION_ID" \
            --argjson target_id "$RELATED_ID" \
            --arg relationship_type "decision-context" \
            '{source_id: $source_id, target_id: $target_id, relationship_type: $relationship_type}')
        
          CONNECT_RESPONSE=$(curl -s -X POST "$API_URL_CONNECTIONS" \
              -H 'Content-Type: application/json' \
              -d "$CONNECTION_JSON")
          
          if echo "$CONNECT_RESPONSE" | grep -q '"id"'; then
              echo "  ✓ Connected to item $RELATED_ID"
          else
              echo "  ✗ Failed to connect to item $RELATED_ID: $CONNECT_RESPONSE"
          fi
        done
      else
        echo "Warning: --related argument is not a valid JSON array: $RELATED"
      fi
    fi
else
    echo "✗ Failed to capture decision"
    echo "$RESPONSE"
    exit 1
fi
