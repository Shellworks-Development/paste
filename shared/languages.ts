/**
 * Languages offered in the editor. The `id` values line up with
 * highlight.js language names/aliases so the client can highlight directly.
 */
export interface Language {
  id: string;
  label: string;
}

export const LANGUAGES: Language[] = [
  { id: "markdown", label: "Markdown" },
  { id: "plaintext", label: "Plain text" },
  { id: "bash", label: "Bash / Shell" },
  { id: "shell", label: "Shell session" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "csharp", label: "C#" },
  { id: "css", label: "CSS" },
  { id: "diff", label: "Diff" },
  { id: "dockerfile", label: "Dockerfile" },
  { id: "go", label: "Go" },
  { id: "graphql", label: "GraphQL" },
  { id: "html", label: "HTML / XML" },
  { id: "http", label: "HTTP" },
  { id: "ini", label: "INI / TOML" },
  { id: "java", label: "Java" },
  { id: "javascript", label: "JavaScript" },
  { id: "json", label: "JSON" },
  { id: "jsx", label: "JSX" },
  { id: "kotlin", label: "Kotlin" },
  { id: "less", label: "Less" },
  { id: "lua", label: "Lua" },
  { id: "makefile", label: "Makefile" },
  { id: "nginx", label: "Nginx config" },
  { id: "objectivec", label: "Objective-C" },
  { id: "perl", label: "Perl" },
  { id: "php", label: "PHP" },
  { id: "powershell", label: "PowerShell" },
  { id: "properties", label: "Properties" },
  { id: "python", label: "Python" },
  { id: "r", label: "R" },
  { id: "ruby", label: "Ruby" },
  { id: "rust", label: "Rust" },
  { id: "scala", label: "Scala" },
  { id: "scss", label: "SCSS" },
  { id: "sql", label: "SQL" },
  { id: "swift", label: "Swift" },
  { id: "toml", label: "TOML" },
  { id: "tsx", label: "TSX" },
  { id: "typescript", label: "TypeScript" },
  { id: "yaml", label: "YAML" },
  { id: "ada", label: "Ada" },
  { id: "apache", label: "Apache config" },
  { id: "arduino", label: "Arduino" },
  { id: "asm", label: "Assembly" },
  { id: "awk", label: "AWK" },
  { id: "basic", label: "BASIC" },
  { id: "clojure", label: "Clojure" },
  { id: "cmake", label: "CMake" },
  { id: "coffeescript", label: "CoffeeScript" },
  { id: "crystal", label: "Crystal" },
  { id: "d", label: "D" },
  { id: "dart", label: "Dart" },
  { id: "delphi", label: "Delphi / Pascal" },
  { id: "django", label: "Django template" },
  { id: "elixir", label: "Elixir" },
  { id: "elm", label: "Elm" },
  { id: "erlang", label: "Erlang" },
  { id: "fortran", label: "Fortran" },
  { id: "fsharp", label: "F#" },
  { id: "gherkin", label: "Gherkin" },
  { id: "glsl", label: "GLSL" },
  { id: "gradle", label: "Gradle" },
  { id: "groovy", label: "Groovy" },
  { id: "haml", label: "Haml" },
  { id: "handlebars", label: "Handlebars" },
  { id: "haskell", label: "Haskell" },
  { id: "haxe", label: "Haxe" },
  { id: "julia", label: "Julia" },
  { id: "latex", label: "LaTeX" },
  { id: "lisp", label: "Lisp" },
  { id: "livescript", label: "LiveScript" },
  { id: "matlab", label: "MATLAB" },
  { id: "mips", label: "MIPS assembly" },
  { id: "nix", label: "Nix" },
  { id: "ocaml", label: "OCaml" },
  { id: "openscad", label: "OpenSCAD" },
  { id: "pgsql", label: "PostgreSQL" },
  { id: "protobuf", label: "Protocol Buffers" },
  { id: "puppet", label: "Puppet" },
  { id: "purebasic", label: "PureBasic" },
  { id: "reasonml", label: "ReasonML" },
  { id: "scheme", label: "Scheme" },
  { id: "smalltalk", label: "Smalltalk" },
  { id: "stylus", label: "Stylus" },
  { id: "tcl", label: "Tcl" },
  { id: "twig", label: "Twig" },
  { id: "vala", label: "Vala" },
  { id: "vbnet", label: "VB.NET" },
  { id: "verilog", label: "Verilog" },
  { id: "vhdl", label: "VHDL" },
  { id: "vim", label: "Vim script" },
  { id: "wasm", label: "WebAssembly" },
  { id: "x86asm", label: "x86 assembly" },
  { id: "xml", label: "XML" },
  { id: "zsh", label: "Zsh" },
];

export const DEFAULT_LANGUAGE = "markdown";

const IDS = new Set(LANGUAGES.map((l) => l.id));

export function isKnownLanguage(id: string): boolean {
  return IDS.has(id);
}

export function languageLabel(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id;
}
