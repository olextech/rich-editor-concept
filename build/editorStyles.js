// Compile all editor CSS (including CKEditor and Tailwind) into owned scopes.
// Keep this transform shared by the demo and the library build.
export function editorStyles() {
  return {
    postcssPlugin: "papercraft-editor-styles",
    OnceExit(root) {
      if (
        !root.source?.input.file
          ?.replaceAll("\\", "/")
          .endsWith("/src/editor/styles.css")
      )
        return;
      const animations = new Map();
      root.walkAtRules(/keyframes$/, (rule) => {
        const name = rule.params.trim();
        animations.set(name, `pc-${name}`);
        rule.params = `pc-${name}`;
      });
      root.walkRules((rule) => {
        rule.selector = rule.selector.replace(/:root\b|:host\b/g, ":scope");
        // Implicit scoped selectors match descendants, not the scope root.
        // Include the root for resets, utility classes, and container rules.
        let parent = rule.parent;
        while (
          parent &&
          !(parent.type === "atrule" && parent.name.endsWith("keyframes"))
        )
          parent = parent.parent;
        if (!parent) rule.selector += `, :scope:is(${rule.selector})`;
      });
      root.walkDecls((decl) => {
        decl.prop = decl.prop.replaceAll("--tw-", "--pc-tw-");
        decl.value = decl.value.replaceAll("--tw-", "--pc-tw-");
        if (
          decl.prop.includes("animation") ||
          decl.prop.startsWith("--animate-")
        ) {
          for (const [name, replacement] of animations) {
            decl.value = decl.value.replace(
              new RegExp(`(?<![\\w-])${name}(?![\\w-])`, "g"),
              replacement,
            );
          }
        }
      });
      root.walkAtRules((rule) => {
        if (rule.name === "property")
          rule.params = rule.params.replaceAll("--tw-", "--pc-tw-");
        if (rule.name === "layer")
          rule.params = rule.params.replace(
            /\b(theme|base|components|utilities|properties)\b/g,
            "pc-$1",
          );
      });
      const nodes = [...root.nodes];
      root.removeAll();
      // Registered properties are global by definition; their names are unique.
      for (const node of nodes) {
        if (
          node.type === "atrule" &&
          (node.name === "property" || node.name.endsWith("keyframes"))
        )
          root.append(node);
      }
      root.append({
        name: "scope",
        params: "(.papercraft-editor, .papercraft-editor-portal)",
        nodes: [],
      });
      const scope = root.last;
      for (const node of nodes) {
        if (node.parent !== root) scope.append(node);
      }
    },
  };
}
