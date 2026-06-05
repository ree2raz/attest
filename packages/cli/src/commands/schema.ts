import { Command, Option } from "clipanion";
import { MANIFEST_SCHEMA, VERDICT_SCHEMA } from "@attest/schema";

export class SchemaCommand extends Command {
  static override paths = [["schema"]];

  static override usage = Command.Usage({
    description: "Print the JSON Schema for a manifest or verdict",
    examples: [
      ["Print manifest schema", "attest schema manifest"],
      ["Print verdict schema", "attest schema verdict"],
    ],
  });

  kind = Option.String({ required: false });

  override execute(): Promise<number> {
    const target = this.kind ?? "manifest";
    if (target !== "manifest" && target !== "verdict") {
      this.context.stderr.write(
        `error: unknown schema kind '${target}' — use manifest or verdict\n`,
      );
      return Promise.resolve(1);
    }
    const schema = target === "manifest" ? MANIFEST_SCHEMA : VERDICT_SCHEMA;
    this.context.stdout.write(JSON.stringify(schema, null, 2) + "\n");
    return Promise.resolve(0);
  }
}
