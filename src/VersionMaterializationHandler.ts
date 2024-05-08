import {
  NotImplementedHttpError,
  OkResponseDescription,
  OperationHandler,
  OperationHttpHandlerInput,
  Representation,
  RepresentationMetadata,
  ResourceStore,
  ResponseDescription,
  TEXT_TURTLE,
  serializeQuads,
} from "@solid/community-server";
import { DataFactory, Quad, Store } from "n3";
import { APPLICATION_SPARQL_VERSION_MATERIALIZATION } from "./utils/ContentTypes";
import { getDeltaIdentifier } from "./utils/DeltaUtil";
import { readableToQuads } from "./utils/QuadUtil";
import { getQueryParameter } from "./utils/QueryUtil";
import { VS } from "./utils/VS";

/**
 * Handles Version Materialization for archiving.
 */
export class VersionMaterializationHandler extends OperationHandler {
  private readonly store: ResourceStore;

  public constructor(store: ResourceStore) {
    super();
    this.store = store;
  }

  public async canHandle({
    request,
    operation,
  }: OperationHttpHandlerInput): Promise<void> {
    if (operation.method !== "GET") {
      throw new NotImplementedHttpError(
        "This handler only supports GET operations"
      );
    }

    if (
      request.headers["content-type"] !=
      APPLICATION_SPARQL_VERSION_MATERIALIZATION
    ) {
      throw new NotImplementedHttpError(
        "This handler only supports version materialization operations"
      );
    }
  }

  public async handle({
    request,
    operation,
  }: OperationHttpHandlerInput): Promise<ResponseDescription> {
    const archiveID = getQueryParameter(request.url, "delta_id");

    const currentRepresentationIdentifier = operation.target;
    const deltaRepresentationIdentifier = getDeltaIdentifier(
      currentRepresentationIdentifier
    );

    const currentRepresentation = await this.store.getRepresentation(
      currentRepresentationIdentifier,
      {}
    );
    const deltaRepresentation = await this.store.getRepresentation(
      deltaRepresentationIdentifier,
      {}
    );

    const materializedQuads = await this.materialize(
      currentRepresentation,
      deltaRepresentation,
      archiveID
    );

    return new OkResponseDescription(
      new RepresentationMetadata(TEXT_TURTLE),
      serializeQuads(materializedQuads)
    );
  }

  async materialize(
    currentRepresentation: Representation,
    deltaRepresentation: Representation,
    archiveID: string
  ): Promise<Quad[]> {
    let nextDelta = currentRepresentation.metadata.get(
      DataFactory.namedNode(VS.next_delta)
    )?.value;

    if (!nextDelta) {
      throw new Error("No deltas have been saved for this resource.");
    }

    const materializedStore = await readableToQuads(
      currentRepresentation.data,
      currentRepresentation.metadata.identifier.value
    );

    const deltaStore = await readableToQuads(deltaRepresentation.data);

    while (nextDelta) {
      const operations = this.operations(deltaStore, nextDelta);
      operations.forEach((quad) => {
        const operation = quad.object as unknown as Quad;
        const change = operation.subject as unknown as Quad;
        switch (operation.object.value) {
          case VS.insert:
            materializedStore.removeQuad(
              change.subject,
              change.predicate,
              change.object
            );
            break;
          case VS.delete:
            materializedStore.addQuad(
              change.subject,
              change.predicate,
              change.object
            );
            break;
        }
      });

      if (nextDelta == archiveID) {
        break;
      }

      nextDelta = this.nextDelta(deltaStore, nextDelta)?.object.value;
    }

    return materializedStore.getQuads(null, null, null, null);
  }

  private operations(store: Store, deltaIdentifier: string): Quad[] {
    return store.getQuads(
      DataFactory.namedNode(deltaIdentifier),
      DataFactory.namedNode(VS.contains_operation),
      null,
      null
    );
  }

  private nextDelta(store: Store, deltaIdentifier: string): Quad | undefined {
    return store.getQuads(
      DataFactory.namedNode(deltaIdentifier),
      DataFactory.namedNode(VS.next_delta),
      null,
      null
    )[0];
  }
}
