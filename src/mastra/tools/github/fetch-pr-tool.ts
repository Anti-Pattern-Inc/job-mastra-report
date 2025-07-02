import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getGitHubToken } from './github-auth-tool';

// GitHub API response types
interface GitHubPullRequest {
  title: string;
  url: string;
  mergedAt: string;
  repository: {
    name: string;
  };
}

interface GitHubSearchResponse {
  data: {
    search: {
      issueCount: number;
      nodes: GitHubPullRequest[];
    };
  };
}

// Tool output types
interface FetchPrToolResponse {
  pullRequests: GitHubPullRequest[];
  totalCount: number;
}

export const fetchPrTool = createTool({
  id: 'fetch-pr',
  description: 'Fetch merged pull requests from GitHub repositories',
  inputSchema: z.object({
    author: z.string().describe('The GitHub username of the PR author'),
    organization: z
      .string()
      .describe('The GitHub organization name')
      .default('Anti-Pattern-Inc'),
    mergedAfter: z.date().describe('Date to filter PRs merged after this date'),
    limit: z
      .number()
      .default(100)
      .describe('Maximum number of PRs to fetch (default: 100)'),
  }),
  outputSchema: z.object({
    pullRequests: z
      .array(
        z.object({
          title: z.string().describe('The title of the pull request'),
          url: z.string().describe('The URL of the pull request'),
          repository: z
            .object({
              name: z.string().describe('The repository name'),
            })
            .describe('Repository information'),
        })
      )
      .describe('Array of pull requests'),
    totalCount: z.number().describe('Total number of PRs found'),
  }),
  execute: async ({ context }): Promise<FetchPrToolResponse> => {
    const { author, organization, mergedAfter, limit = 100 } = context;

    // Get GitHub token using the auth tool
    const githubToken = await getGitHubToken();

    const query = `
      query {
        search(first: ${limit}, type: ISSUE, query: "author:${author} org:${organization} is:pr merged:>=${mergedAfter}") {
          issueCount
          nodes {
            ... on PullRequest {
              title
              url
              mergedAt
              repository {
                name
              }
            }
          }
        }
      }
    `;

    try {
      const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(
          `GitHub API request failed: ${response.status} ${response.statusText}`
        );
      }

      const data: GitHubSearchResponse = await response.json();

      if (!data.data || !data.data.search) {
        throw new Error('Invalid response structure from GitHub API');
      }

      const pullRequests = data.data.search.nodes;

      return {
        pullRequests,
        totalCount: pullRequests.length,
      };
    } catch (error) {
      throw new Error(
        `Failed to fetch pull requests: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
});
