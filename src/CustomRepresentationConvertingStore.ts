import {
    AuxiliaryStrategy,
    Guarded,
    RepresentationConverter,
    RepresentationConvertingStore,
    RepresentationPreferences,
    ResourceStore,
    cloneRepresentation,
} from "@solid/community-server";

import { finished } from "stream";
import { promisify } from "util";
import type { Readable } from "node:stream";

import type { ResourceIdentifier } from "@solid/community-server/dist/http/representation/ResourceIdentifier";
import type { Conditions } from "@solid/community-server/dist/storage/conditions/Conditions";
import type { Representation } from "@solid/community-server/dist/http/representation/Representation";
import type { ChangeMap } from "@solid/community-server/dist/storage/ResourceStore";
import { DataFactory } from "n3";
import namedNode = DataFactory.namedNode;

export class CustomRepresentationConvertingStore<
    T extends ResourceStore = ResourceStore
> extends RepresentationConvertingStore<T> {
    public constructor(
        source: T,
        metadataStrategy: AuxiliaryStrategy,
        options: {
            outConverter?: RepresentationConverter;
            inConverter?: RepresentationConverter;
            inPreferences?: RepresentationPreferences;
        }
    ) {
        super(source, metadataStrategy, options);
        this.logger.info(
            "We just made our custom RepresentationConvertingStore!"
        );
    }

    public async getRepresentation(
        identifier: ResourceIdentifier,
        preferences: RepresentationPreferences,
        conditions?: Conditions
    ): Promise<Representation> {
        return await super.getRepresentation(
            identifier,
            preferences,
            conditions
        );
    }
    public async addResource(
        identifier: ResourceIdentifier,
        representation: Representation,
        conditions?: Conditions
    ): Promise<ChangeMap> {
        this.logger.info(
            `We just called custom addResource(): identifier: ${identifier.path}!`
        );
        return super.addResource(identifier, representation, conditions);
    }
    public async setRepresentation(
        identifier: ResourceIdentifier,
        representation: Representation,
        conditions?: Conditions
    ): Promise<ChangeMap> {
        this.logger.info(
            `We just called custom setRepresentation(): identifier: ${identifier.path}!`
        );
        try {
            // Create a copy of the old resource
            const currentRepresentation = await this.getRepresentation(
                identifier,
                {},
                conditions
            );

            let currentRep = await cloneRepresentation(currentRepresentation);
            let newRep = await cloneRepresentation(representation);

            let diff = diffStreams(currentRep, newRep);

            if (diff.length === 0) {
                this.logger.info(
                    "The new representation is the same as the old one!"
                );
            }else{
                this.logger.info(
                    `length: ${diff.length} diff: ${diff}`
                );
            }

            const newIdentifier = {
                path:
                    identifier.path +
                    new Date().toISOString().replace(":", "."),
            };
            await super.setRepresentation(
                newIdentifier,
                currentRepresentation,
                conditions
            );
            this.logger.info(
                `We just created a copy of the old resource at: ${newIdentifier.path}!`
            );
        } catch (error) {
            this.logger.error(error as string);
        }
        return super.setRepresentation(identifier, representation, conditions);
    }
}

interface Diff {
    position: number;
    s1: number;
    s2: number;
}

function diffStreams(old: Representation, newdata: Representation): Diff[] {
    let diff: Diff[] = [];
    let position = 0;

    const oldStream = old.data;
    const newStream = newdata.data;

    console.log("HERE");

    oldStream.on("data", (chunk_old) => {
        
        console.log("HERE2");
        newStream.on("data", (chunk_new) => {
            console.log("HERE3");
            if (chunk_old != chunk_new) {
                console.log("data: ", chunk_old, chunk_new);
                diff.push({
                    position: position,
                    s1: chunk_old.length,
                    s2: chunk_new.length,
                });
            }
            position += chunk_old.length;
        });
    });

    return diff;
}
