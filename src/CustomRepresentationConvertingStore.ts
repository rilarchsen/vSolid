import {
    AuxiliaryStrategy,
    Guarded,
    RepresentationConverter,
    RepresentationConvertingStore,
    RepresentationPreferences,
    ResourceStore,
} from "@solid/community-server";

import { finished } from "stream";
import { promisify } from "util";
import type { Readable } from "node:stream";
import cloneable from "cloneable-readable";

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

            diffStreams(representation.data, currentRepresentation.data).then(
                (diff) => {
                    this.logger.info(`We just calculated the diff: ${diff}!`);
                }
            );

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

async function diffStreams(old: Readable, newdata: Readable): Promise<Diff[]> {
    let diff: Diff[] = [];
    let position = 0;

    const cloneS1 = cloneable(old);
    const cloneS2 = cloneable(newdata);

    return new Promise((resolve, reject) => {
        cloneS1.on("data", (chunk1: Buffer) => {
            cloneS2.on("readable", function check() {
                const chunk2: Buffer | null = cloneS2.read(chunk1.length);

                if (chunk2 === null) {
                    cloneS2.once("readable", check);
                } else {
                    for (let i = 0; i < chunk1.length; i++) {
                        if (chunk1[i] !== chunk2[i]) {
                            diff.push({
                                position: position + i,
                                s1: chunk1[i],
                                s2: chunk2[i],
                            });
                        }
                    }
                    position += chunk1.length;
                }
            });
        });

        Promise.all([
            promisify(finished)(cloneS1),
            promisify(finished)(cloneS2),
        ]).then(() => {
            resolve(diff);
        }, reject);
    });
}
