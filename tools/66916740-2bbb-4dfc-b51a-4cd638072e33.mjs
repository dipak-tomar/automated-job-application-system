import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Octokit } from '@octokit/rest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { relative, join } from 'path';

let connectionSettings;
async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY ? "repl " + process.env.REPL_IDENTITY : process.env.WEB_REPL_RENEWAL ? "depl " + process.env.WEB_REPL_RENEWAL : null;
  if (!xReplitToken) {
    throw new Error("X_REPLIT_TOKEN not found for repl/depl");
  }
  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=github",
    {
      headers: {
        "Accept": "application/json",
        "X_REPLIT_TOKEN": xReplitToken
      }
    }
  ).then((res) => res.json()).then((data) => data.items?.[0]);
  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
  if (!connectionSettings || !accessToken) {
    throw new Error("GitHub not connected");
  }
  return accessToken;
}
async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

const getAllFiles = (dirPath, arrayOfFiles = []) => {
  const files = readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];
  files.forEach((file) => {
    const fullPath = join(dirPath, file);
    if (statSync(fullPath).isDirectory()) {
      if (!["node_modules", ".git", ".next", "dist", "build", ".env"].includes(file)) {
        arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
      }
    } else {
      if (!file.match(/\.(log|tmp|cache)$/)) {
        arrayOfFiles.push(fullPath);
      }
    }
  });
  return arrayOfFiles;
};
const githubPushTool = createTool({
  id: "github-push-tool",
  description: "Creates a GitHub repository and uploads the entire project code",
  inputSchema: z.object({
    repositoryName: z.string().describe("Name of the GitHub repository to create"),
    description: z.string().describe("Description of the repository"),
    isPrivate: z.boolean().default(false).describe("Whether the repository should be private")
  }),
  outputSchema: z.object({
    repositoryUrl: z.string(),
    success: z.boolean(),
    message: z.string()
  }),
  execute: async ({ context: { repositoryName, description, isPrivate }, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("\u{1F680} [GitHubPush] Starting repository creation and code upload", { repositoryName });
    try {
      const octokit = await getUncachableGitHubClient();
      const { data: user } = await octokit.rest.users.getAuthenticated();
      logger?.info("\u{1F4DD} [GitHubPush] Authenticated as user", { username: user.login });
      logger?.info("\u{1F4DD} [GitHubPush] Creating repository");
      const { data: repo } = await octokit.rest.repos.createForAuthenticatedUser({
        name: repositoryName,
        description,
        private: isPrivate,
        auto_init: true
      });
      logger?.info("\u2705 [GitHubPush] Repository created successfully", {
        repoUrl: repo.html_url,
        repoName: repo.full_name
      });
      const projectRoot = process.cwd();
      const allFiles = getAllFiles(projectRoot);
      logger?.info("\u{1F4DD} [GitHubPush] Found files to upload", { fileCount: allFiles.length });
      for (const filePath of allFiles) {
        try {
          const relativePath = relative(projectRoot, filePath);
          const content = readFileSync(filePath);
          const base64Content = content.toString("base64");
          await octokit.rest.repos.createOrUpdateFileContents({
            owner: user.login,
            repo: repositoryName,
            path: relativePath,
            message: `Add ${relativePath}`,
            content: base64Content
          });
          logger?.info("\u{1F4C4} [GitHubPush] Uploaded file", { file: relativePath });
        } catch (fileError) {
          logger?.warn("\u26A0\uFE0F [GitHubPush] Failed to upload file", {
            file: relative(projectRoot, filePath),
            error: fileError
          });
        }
      }
      logger?.info("\u2705 [GitHubPush] All files uploaded successfully");
      return {
        repositoryUrl: repo.html_url,
        success: true,
        message: `Repository created successfully at ${repo.html_url}`
      };
    } catch (error) {
      logger?.error("\u274C [GitHubPush] Failed to create repository or upload files", { error });
      return {
        repositoryUrl: "",
        success: false,
        message: `Failed to create repository: ${error}`
      };
    }
  }
});

export { githubPushTool };
//# sourceMappingURL=66916740-2bbb-4dfc-b51a-4cd638072e33.mjs.map
