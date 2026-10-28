import type { SVGProps } from "react";

// The same 24px, 1.8px geometric vocabulary as the landing page.
const paths = {
  ArrowLeft: "M20 12H5m6-7-7 7 7 7",
  ArrowRight: "M4 12h15m-6-7 7 7-7 7",
  ArrowUpRight: "M6 18 18 6M6 6h12v12",
  Bookmark: "M6 3h12v18l-6-4-6 4Z",
  ChevronDown: "m6 9 6 6 6-6",
  FileText: "M5 3h9l5 5v13H5ZM14 3v6h5M8 13h8M8 17h8",
  LoaderCircle: "M21 12a9 9 0 1 1-9-9",
  Menu: "M4 8h16M4 16h16",
  MessageCircle:
    "M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l1.7-4A8.5 8.5 0 1 1 21 11.5Z",
  Plus: "M12 5v14M5 12h14",
  Save: "M5 3h12l4 4v14H3V3Zm2 0v6h10V3M7 21v-7h10v7",
  Search: "M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0ZM16 16l5 5",
  Share2: "M12 16V3m-5 5 5-5 5 5M5 12v9h14v-9",
  X: "m6 6 12 12M18 6 6 18",
};

function icon(name: keyof typeof paths) {
  return function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        <path d={paths[name]} />
      </svg>
    );
  };
}

export const ArrowLeft = icon("ArrowLeft");
export const ArrowRight = icon("ArrowRight");
export const ArrowUpRight = icon("ArrowUpRight");
export const Bookmark = icon("Bookmark");
export const ChevronDown = icon("ChevronDown");
export const FileText = icon("FileText");
export const LoaderCircle = icon("LoaderCircle");
export const Menu = icon("Menu");
export const MessageCircle = icon("MessageCircle");
export const Plus = icon("Plus");
export const Save = icon("Save");
export const Search = icon("Search");
export const Share2 = icon("Share2");
export const X = icon("X");

// Compose a new conversation: established square-and-pencil action glyph.
export { SquarePen as Compose } from "lucide-react";
