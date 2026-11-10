import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const WEIGHT_NAMES: Record<number, string> = {
  100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium",
  600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black",
};

export function weightName(w: number) {
  return WEIGHT_NAMES[w] ?? String(w);
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const PROVIDER_NAMES: Record<string, string> = {
  google: "Google Fonts", fontsource: "Fontsource", bunny: "Bunny Fonts", fontsquirrel: "Font Squirrel", fontshare: "Fontshare",
};
export const providerName = (id: string) => PROVIDER_NAMES[id] ?? id;
