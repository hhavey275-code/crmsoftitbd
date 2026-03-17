import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function friendlyEdgeError(err: any): string {
  const msg = err?.message || String(err);
  if (msg.includes("non-2xx")) {
    return "Server error occurred. Please try again or contact admin.";
  }
  return msg;
}
