import { makeExecutableSchema } from '@graphql-tools/schema'
import { SchemaGeneratorService } from './schema-generator.service'
import { ApolloContext } from '../app/api.service'
import { Config } from 'apollo-server-core/src/types'

export class ApolloConfigFactoryService {
  constructor(private readonly schemaGenerator: SchemaGeneratorService) {}

  async createGqlOptions(context: ApolloContext): Promise<Config> {
    const schemaDefinition = await this.schemaGenerator.generateSchema(context)
    const schema = makeExecutableSchema(schemaDefinition)

    return {
      schema: schema,
      playground: true,
    } as Config
  }
}
