/**
 * Config loader and derived helpers.
 *
 * This is the single entry point for reading the user's command-space config
 * from anywhere in the app. Server routes and client components import from
 * here rather than reaching into the root config file directly.
 */

import config, { FocusArea, PromotionTarget } from "@/command-space.config";

export { config };
export type { FocusArea, PromotionTarget };
export type CommandSpaceConfig = typeof config;

export const DEFAULT_FOCUS_AREA_PRIORITY = 50;

export function getFocusAreaIds(): string[] {
  return config.focusAreas.map((area) => area.id);
}

export function isValidFocusArea(value: string | null | undefined): boolean {
  if (!value) return false;
  return config.focusAreas.some((area) => area.id === value);
}

export function getFocusArea(id: string | null | undefined): FocusArea | undefined {
  if (!id) return undefined;
  return config.focusAreas.find((area) => area.id === id);
}

export function getFocusAreaLabel(id: string | null | undefined): string {
  return getFocusArea(id)?.label ?? id ?? "Unassigned";
}

export function getFocusAreaColor(id: string | null | undefined): string {
  return getFocusArea(id)?.color ?? "#6b7280";
}

export function getFocusAreaPriority(id: string | null | undefined): number {
  return getFocusArea(id)?.priority ?? DEFAULT_FOCUS_AREA_PRIORITY;
}

export function getDefaultFocusAreaId(): string {
  return config.focusAreas[0]?.id ?? "default";
}

export function getAgentName(): string {
  return config.agent.name;
}

export function getDashboardTitle(): string {
  return config.dashboard.title;
}
