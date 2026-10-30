export const navigation = [
  { label: "YOUR KITCHEN", items: [
    { path: "/", label: "Today", icon: "⌂" },
    { path: "/pantry", label: "Pantry inventory", icon: "▣" },
    { path: "/use-soon", label: "Use soon", icon: "◷" },
    { path: "/storage-map", label: "Storage map", icon: "▦" },
  ] },
  { label: "PLAN & DISCOVER", items: [
    { path: "/rescue-plan", label: "Rescue plan", icon: "✓" },
    { path: "/recipes", label: "Recipes & meals", icon: "♧" },
    { path: "/ai-copilot", label: "Kitchen copilot", icon: "✦" },
    { path: "/smart-capture", label: "Smart capture", icon: "⌁" },
  ] },
  { label: "TOGETHER", items: [
    { path: "/public-pantry", label: "Public pantry", icon: "♡" },
    { path: "/household", label: "Household", icon: "♙" },
    { path: "/insights", label: "Waste insights", icon: "▥" },
  ] },
  { label: "SETTINGS", items: [
    { path: "/alerts", label: "Expiry alerts", icon: "◉" },
    { path: "/preferences", label: "Food preferences", icon: "⚙" },
    { path: "/smart-tools", label: "All kitchen tools", icon: "☷" },
  ] },
];
export const pageTitles: Record<string,string> = Object.fromEntries([
  ...navigation.flatMap(group=>group.items.map(item=>[item.path,item.label])),
  ["/overview","Pantry overview"],
]);
export const pageDescriptions: Record<string,string> = {
  "/pantry":"Everything you have, with a place and a purpose. Search, sort, and keep it up to date.",
  "/use-soon":"A little attention today makes less waste tomorrow. Start with these ingredients.",
  "/storage-map":"A place for everything. Map your refrigerator, cabinets, shelves, and kitchen surfaces.",
  "/rescue-plan":"Turn the food you have into a thoughtful plan for today.",
  "/recipes":"Good meals start with what’s already in your kitchen. Save your favorites to your meal plan.",
  "/ai-copilot":"A helping hand for your next meal. Ask a question or explore your ingredients.",
  "/smart-capture":"From grocery bag to pantry in a few simple steps.",
  "/public-pantry":"Connect good food with people who can use it. Share thoughtfully and safely.",
  "/household":"Bring everyone in your kitchen onto the same page.",
  "/insights":"See what you’re using, what needs attention, and where a little planning can help.",
  "/alerts":"Gentle reminders to help you use good food in time.",
  "/preferences":"Make your kitchen experience feel a little more like you.",
  "/smart-tools":"Your pantry, planning, and household tools, all within reach.",
  "/overview":"A clear view of what’s in your kitchen and the food you’ve rescued.",
};
