import { glob } from "glob";
import path from "path";
import shelljs from "shelljs";

async function main() {
  const argFileName = process.argv[2]
    ? path.resolve(path.dirname(process.argv[2]), "build.{ts,mjs}")
    : "**/build.{ts,mjs}";

  const files = await glob(argFileName, { ignore: "node_modules/**" });

  for (const fileName of files) {
    shelljs.exec(`node ${fileName}`);
  }
}

main().catch((e) => console.error(e));
