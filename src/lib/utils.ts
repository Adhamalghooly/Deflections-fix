import { type ClassValue, clsx } from "clsx";
import { bgOpacity } from "motion/react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
