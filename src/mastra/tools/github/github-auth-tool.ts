import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { execSync } from 'child_process';

interface GitHubAuthResponse {
  token: string;
  username: string;
  scopes: string[];
  source: 'environment' | 'github-cli';
}

export const githubAuthTool = createTool({
  id: 'github-auth',
  description: `
  Get GitHub authentication token from environment variable or GitHub CLI.
  If no token is found, it will throw an error.
  If a token is found, it will return the token, username, scopes, and source.
  `,
  inputSchema: z.object({
    requireToken: z
      .boolean()
      .default(true)
      .describe('Whether to throw error if no token is found'),
  }),
  outputSchema: z.object({
    token: z.string().describe('GitHub authentication token'),
    username: z.string().describe('GitHub username'),
    scopes: z.array(z.string()).describe('Token scopes'),
    source: z
      .enum(['environment', 'github-cli'])
      .describe('Source of the token'),
  }),
  execute: async ({ context }): Promise<GitHubAuthResponse> => {
    const { requireToken = true } = context;

    let token = '';
    let source: 'environment' | 'github-cli' = 'github-cli';

    // Try GitHub CLI first (preferred)
    try {
      token = execSync('gh auth token', { encoding: 'utf8' }).trim();
      source = 'github-cli';
      console.log('✓ Using GitHub CLI token (preferred)');
    } catch {
      // Fallback to environment variable
      token = process.env.GITHUB_TOKEN || '';
      if (token) {
        source = 'environment';
        console.log('✓ Using GITHUB_TOKEN environment variable (fallback)');
      } else {
        if (requireToken) {
          throw new Error(
            'No GitHub token found. Please either:\n' +
              '1. Login with GitHub CLI: gh auth login (recommended), or\n' +
              '2. Set GITHUB_TOKEN environment variable'
          );
        }
        return {
          token: '',
          username: '',
          scopes: [],
          source: 'github-cli',
        };
      }
    }

    // Get user info and scopes
    let username = '';
    let scopes: string[] = [];

    try {
      if (source === 'github-cli') {
        // Get username and scopes from GitHub CLI
        const statusOutput = execSync('gh auth status', {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Parse username from status output
        const usernameMatch = statusOutput.match(/account (\w+)/);
        if (usernameMatch) {
          username = usernameMatch[1];
        }

        // Parse scopes from status output
        const scopesMatch = statusOutput.match(/Token scopes: '([^']+)'/);
        if (scopesMatch) {
          scopes = scopesMatch[1].split(', ');
        }
      } else {
        // For environment token, we'd need to make an API call to get user info
        // For now, just provide basic info
        username = 'unknown';
        scopes = ['unknown'];
      }
    } catch (error) {
      // If we can't get user info, continue with basic token info
      console.warn('Could not retrieve user information:', error);
    }

    return {
      token,
      username,
      scopes,
      source,
    };
  },
});

// Helper function for other tools to use
export const getGitHubToken = async (): Promise<string> => {
  let token = '';

  // Try GitHub CLI first (preferred)
  try {
    token = execSync('gh auth token', { encoding: 'utf8' }).trim();
    console.log('✓ Using GitHub CLI token (preferred)');
    return token;
  } catch {
    // Fallback to environment variable
    token = process.env.GITHUB_TOKEN || '';
    if (token) {
      console.log('✓ Using GITHUB_TOKEN environment variable (fallback)');
      return token;
    } else {
      throw new Error(
        'No GitHub token found. Please either:\n' +
          '1. Login with GitHub CLI: gh auth login (recommended), or\n' +
          '2. Set GITHUB_TOKEN environment variable'
      );
    }
  }
};
