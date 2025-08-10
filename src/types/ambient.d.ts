declare module "terminal-markdown" {
  const render: (markdown: string, options?: any) => string;
  export default render;
}

declare module "ink-markdown" {
  import React from "react";
  const Markdown: React.ComponentType<{ children?: string } & Record<string, any>>;
  export default Markdown;
}
