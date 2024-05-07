import { readableToString } from "@solid/community-server";
import { Parser, Store } from "n3";
import { Readable } from "stream";

export async function readableToQuads(
  stream: Readable,
  baseIRI?: string | undefined
): Promise<Store> {
  const str = await readableToString(stream);
  const parser = new Parser({
    blankNodePrefix: "",
    baseIRI: baseIRI,
  });
  const existingQuads = parser.parse(str);
  const store = new Store();
  store.addQuads(existingQuads);
  return store;
}
