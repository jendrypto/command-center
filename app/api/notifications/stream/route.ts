import { events } from '@/lib/events'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const onItem = (item: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`))
      }

      events.on('new-item', onItem)

      request.signal.addEventListener('abort', () => {
        events.off('new-item', onItem)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
