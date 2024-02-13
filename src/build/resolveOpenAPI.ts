/* eslint-env node */
/* eslint import/no-nodejs-modules:0 */
/* eslint-disable no-console */

import {promises as fs} from 'fs';

import {cache} from 'react';

import {DeRefedOpenAPI} from './open-api/types';

// SENTRY_API_SCHEMA_SHA is used in the sentry-docs GHA workflow in getsentry/sentry-api-schema.
// DO NOT change variable name unless you change it in the sentry-docs GHA workflow in getsentry/sentry-api-schema.
const SENTRY_API_SCHEMA_SHA = 'deea76e7205d4e1efb45f91796b9fc73499de226';

const activeEnv = process.env.GATSBY_ENV || process.env.NODE_ENV || 'development';

async function resolveOpenAPI(): Promise<DeRefedOpenAPI> {
  if (activeEnv === 'development' && process.env.OPENAPI_LOCAL_PATH) {
    try {
      console.log(`Fetching from ${process.env.OPENAPI_LOCAL_PATH}`);
      const data = await fs.readFile(process.env.OPENAPI_LOCAL_PATH, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.log(
        `Failed to connect to  ${process.env.OPENAPI_LOCAL_PATH}. Continuing to fetch versioned schema from GitHub.
        ${error}`
      );
    }
  }
  const response = await fetch(
    `https://raw.githubusercontent.com/getsentry/sentry-api-schema/${SENTRY_API_SCHEMA_SHA}/openapi-derefed.json`
  );
  return await response.json();
}

export type APIParameter = {
  description: string;
  name: string;
  required: boolean;
  schema: {
    type: string;
    format?: string;
    items?: {
      type: string;
    };
  };
};

export type API = {
  apiPath: string;
  bodyParameters: APIParameter[];
  method: string;
  name: string;
  pathParameters: APIParameter[];
  queryParameters: APIParameter[];
  responses: any;
  slug: string;
  bodyContentType?: string;
  descriptionMarkdown?: string;
  requestBodyContent?: any;
  security?: {[key: string]: string[]};
  summary?: string;
};

export type APICategory = {
  apis: API[];
  name: string;
  slug: string;
  description?: string;
};

function slugify(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9/ ]/g, '')
    .trim()
    .replace(/\s/g, '-')
    .toLowerCase();
}

export const apiCategories = cache(async (): Promise<APICategory[]> => {
  const data = await resolveOpenAPI();

  const categoryMap: {[name: string]: APICategory} = {};
  data.tags.forEach(tag => {
    categoryMap[tag.name] = {
      name: tag['x-sidebar-name'] || tag.name,
      slug: slugify(tag.name),
      description: tag.description,
      apis: [],
    };
  });

  Object.entries(data.paths).forEach(([apiPath, methods]) => {
    Object.entries(methods).forEach(([method, apiData]) => {
      apiData.tags.forEach(tag => {
        categoryMap[tag].apis.push({
          apiPath,
          method,
          name: apiData.operationId,
          slug: slugify(apiData.operationId),
          summary: apiData.summary,
          descriptionMarkdown: apiData.description,
          pathParameters: apiData.parameters.filter(
            p => p.in === 'path'
          ) as APIParameter[],
          queryParameters: apiData.parameters.filter(
            p => p.in === 'query'
          ) as APIParameter[],
          requestBodyContent: {
            example:
              apiData.requestBody?.content &&
              Object.values(apiData.requestBody.content)[0].example,
          },
          bodyContentType: getBodyContentType(apiData),
          bodyParameters: getBodyParameters(apiData),
          security: apiData.security,
          responses: Object.entries(apiData.responses)
            .map(([status_code, response]) => ({
              status_code,
              ...response,
            }))
            .map(response => {
              const {content, ...rest} = response;
              return {
                content:
                  content &&
                  Object.entries(content).map(([content_type, contentData]) => ({
                    content_type,
                    ...contentData,
                  }))[0],
                ...rest,
              };
            }),
        });
      });
    });
  });

  const categories = Object.values(categoryMap);
  categories.sort((a, b) => a.name.localeCompare(b.name));
  categories.forEach(c => {
    c.apis.sort((a, b) => a.name.localeCompare(b.name));
  });
  return categories;
});

function getBodyParameters(apiData): APIParameter[] {
  const content = apiData.requestBody?.content;
  const contentType = content && Object.values(content)[0];
  const properties = contentType?.schema?.properties;
  if (!properties) {
    return [];
  }

  const required: string[] = contentType?.schema?.required || [];

  return Object.entries(properties).map(([name, props]: [string, any]) => ({
    name,
    description: props.description,
    required: required.includes(name),
    schema: {
      type: props.type,
      format: '',
      items: props.items,
    },
  }));
}

function getBodyContentType(apiData): string | undefined {
  const content = apiData.requestBody?.content;
  const types = content && Object.keys(content);
  if (!types?.length) {
    return undefined;
  }
  return types[0];
}
