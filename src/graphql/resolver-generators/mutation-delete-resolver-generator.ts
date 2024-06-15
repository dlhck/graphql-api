import {
  Entry,
  PersistenceService,
} from '../../persistence/persistence.service'
import { GraphQLFieldResolver } from 'graphql/type/definition'
import { ApolloContext } from '../../app/api.service'
import { GraphQLError } from 'graphql/error/GraphQLError'
import { ContentEntry, ContentEntryDraft } from '@commitspark/git-adapter'
import { EntryReferenceUtil } from '../schema-utils/entry-reference-util'
import { isObjectType } from 'graphql'

export class MutationDeleteResolverGenerator {
  constructor(
    private readonly persistence: PersistenceService,
    private readonly entryReferenceUtil: EntryReferenceUtil,
  ) {}

  public createResolver(
    typeName: string,
  ): GraphQLFieldResolver<any, ApolloContext, any, Promise<Entry>> {
    return async (
      source,
      args,
      context: ApolloContext,
      info,
    ): Promise<Entry> => {
      const entry: ContentEntry = await this.persistence.findByTypeId(
        context.gitAdapter,
        context.getCurrentRef(),
        typeName,
        args.id,
      )

      if (
        entry.metadata.referencedBy &&
        entry.metadata.referencedBy.length > 0
      ) {
        const otherIds = entry.metadata.referencedBy
          .map((referenceId) => `"${referenceId}"`)
          .join(', ')
        throw new GraphQLError(
          `Entry with id "${args.id}" is referenced by other entries: [${otherIds}]`,
          {
            extensions: {
              code: 'IN_USE',
              argumentName: 'id',
            },
          },
        )
      }

      const entryType = info.schema.getType(typeName)
      if (!isObjectType(entryType)) {
        throw new Error('Expected to delete an ObjectType')
      }

      const referencedEntryIds =
        await this.entryReferenceUtil.getReferencedEntryIds(
          entryType,
          context,
          null,
          entryType,
          entry.data,
        )
      const referencedEntryUpdates: ContentEntryDraft[] = []
      for (const referencedEntryId of referencedEntryIds) {
        const noLongerReferencedEntry = await this.persistence.findById(
          context.gitAdapter,
          context.getCurrentRef(),
          referencedEntryId,
        )
        referencedEntryUpdates.push({
          ...noLongerReferencedEntry,
          metadata: {
            ...noLongerReferencedEntry.metadata,
            referencedBy: noLongerReferencedEntry.metadata.referencedBy?.filter(
              (entryId) => entryId !== args.id,
            ),
          },
          deletion: false,
        })
      }

      const commit = await context.gitAdapter.createCommit({
        ref: context.branch,
        parentSha: context.getCurrentRef(),
        contentEntries: [
          {
            ...entry,
            deletion: true,
          },
          ...referencedEntryUpdates,
        ],
        message: args.message,
      })
      context.setCurrentRef(commit.ref)

      return {
        id: args.id,
      }
    }
  }
}
