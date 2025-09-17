import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const sheetsTrackerTool = createTool({
  id: "sheets-tracker-tool",
  description: "Tracks job applications in a Google Sheets spreadsheet with application status and details",
  inputSchema: z.object({
    spreadsheetId: z.string().default("demo-spreadsheet-id").describe("Google Sheets spreadsheet ID where job applications will be tracked"),
    jobApplications: z.array(z.object({
      jobTitle: z.string(),
      company: z.string(),
      location: z.string(),
      source: z.string(),
      jobUrl: z.string(),
      applicationStatus: z.enum(["applied", "failed", "already_applied", "pending"]),
      appliedDate: z.string(),
      notes: z.string()
    })).describe("Array of job applications to add to the tracking sheet")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    recordsAdded: z.number(),
    spreadsheetUrl: z.string(),
    message: z.string()
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { spreadsheetId, jobApplications } = context;
    logger?.info("\u{1F527} [SheetsTracker] Starting job application tracking", {
      spreadsheetId,
      recordCount: jobApplications.length
    });
    try {
      logger?.info("\u{1F4CA} [SheetsTracker] Simulating Google Sheets integration");
      logger?.info("\u{1F4DD} [SheetsTracker] Processing job application records");
      let recordsAdded = 0;
      for (const application of jobApplications) {
        try {
          logger?.info("\u{1F4DD} [SheetsTracker] Adding record", {
            jobTitle: application.jobTitle,
            company: application.company,
            status: application.applicationStatus
          });
          recordsAdded++;
        } catch (error) {
          logger?.error("\u274C [SheetsTracker] Failed to add record", {
            jobTitle: application.jobTitle,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
      logger?.info("\u2705 [SheetsTracker] Job application tracking completed", {
        recordsAdded,
        spreadsheetUrl
      });
      return {
        success: true,
        recordsAdded,
        spreadsheetUrl,
        message: `Successfully tracked ${recordsAdded} job applications in Google Sheets. Note: This is a demo implementation - in production, real Google Sheets API integration would be used.`
      };
    } catch (error) {
      logger?.error("\u274C [SheetsTracker] Job application tracking failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        success: false,
        recordsAdded: 0,
        spreadsheetUrl: "",
        message: `Job application tracking failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
});

export { sheetsTrackerTool };
//# sourceMappingURL=80e8974b-d7b8-4246-9532-164b151bcbfa.mjs.map
