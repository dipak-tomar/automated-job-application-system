import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import puppeteer from 'puppeteer';

const fillLinkedInApplication = async (jobUrl, formData, page, logger) => {
  logger?.info("\u{1F527} [ApplicationFiller] Filling LinkedIn application", { jobUrl });
  try {
    await page.goto(jobUrl, { waitUntil: "networkidle2" });
    const alreadyApplied = await page.$(".artdeco-inline-feedback--success");
    if (alreadyApplied) {
      return {
        jobUrl,
        status: "already_applied",
        message: "Already applied to this position"
      };
    }
    const easyApplyButton = await page.$('button[aria-label*="Easy Apply"]');
    if (!easyApplyButton) {
      return {
        jobUrl,
        status: "failed",
        message: "Easy Apply not available for this position"
      };
    }
    await easyApplyButton.click();
    await page.waitForTimeout(2e3);
    const phoneInput = await page.$('input[name="phoneNumber"]');
    if (phoneInput) {
      await phoneInput.click({ clickCount: 3 });
      await phoneInput.type(formData.personalInfo.phone);
    }
    const coverLetterTextarea = await page.$('textarea[name="message"]');
    if (coverLetterTextarea) {
      const coverLetter = `Dear Hiring Manager,

${formData.summary}

Key Skills: ${formData.skills.slice(0, 5).join(", ")}

I am excited about this opportunity and would love to contribute to your team.

Best regards,
${formData.personalInfo.name}`;
      await coverLetterTextarea.type(coverLetter);
    }
    let currentStep = 0;
    const maxSteps = 5;
    while (currentStep < maxSteps) {
      const nextButton = await page.$('button[aria-label="Continue to next step"]') || await page.$('button:has-text("Next")') || await page.$('button[type="submit"]');
      if (!nextButton) {
        break;
      }
      const buttonText = await nextButton.textContent();
      if (buttonText?.toLowerCase().includes("submit") || buttonText?.toLowerCase().includes("send application")) {
        await nextButton.click();
        await page.waitForTimeout(3e3);
        break;
      }
      await nextButton.click();
      await page.waitForTimeout(2e3);
      currentStep++;
    }
    const successMessage = await page.$(".artdeco-inline-feedback--success");
    if (successMessage) {
      return {
        jobUrl,
        status: "applied",
        message: "Successfully applied to the position"
      };
    }
    return {
      jobUrl,
      status: "failed",
      message: "Application process incomplete or failed"
    };
  } catch (error) {
    logger?.error("\u274C [ApplicationFiller] LinkedIn application failed", {
      jobUrl,
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      jobUrl,
      status: "failed",
      message: `Application failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};
const fillNaukriApplication = async (jobUrl, formData, page, logger) => {
  logger?.info("\u{1F527} [ApplicationFiller] Filling Naukri application", { jobUrl });
  try {
    await page.goto(jobUrl, { waitUntil: "networkidle2" });
    const applyButton = await page.$("button.apply") || await page.$("a.apply") || await page.$('button:has-text("Apply")');
    if (!applyButton) {
      return {
        jobUrl,
        status: "failed",
        message: "Apply button not found on this job posting"
      };
    }
    await applyButton.click();
    await page.waitForTimeout(3e3);
    const additionalInfoTextarea = await page.$('textarea[name="coverLetter"]') || await page.$('textarea[placeholder*="cover letter"]');
    if (additionalInfoTextarea) {
      const coverLetter = `Dear Hiring Manager,

${formData.summary}

Relevant Experience:
${formData.experience.map((exp) => `- ${exp.title} at ${exp.company} (${exp.duration})`).join("\n")}

Technical Skills: ${formData.skills.join(", ")}

I am excited about this opportunity and look forward to hearing from you.

Best regards,
${formData.personalInfo.name}`;
      await additionalInfoTextarea.type(coverLetter);
    }
    const submitButton = await page.$('button[type="submit"]') || await page.$('button:has-text("Submit")') || await page.$('input[type="submit"]');
    if (submitButton) {
      await submitButton.click();
      await page.waitForTimeout(3e3);
    }
    const successElements = await page.$$(".success, .applied, .application-success");
    if (successElements.length > 0) {
      return {
        jobUrl,
        status: "applied",
        message: "Successfully applied to the position"
      };
    }
    return {
      jobUrl,
      status: "applied",
      message: "Application submitted (verification pending)"
    };
  } catch (error) {
    logger?.error("\u274C [ApplicationFiller] Naukri application failed", {
      jobUrl,
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      jobUrl,
      status: "failed",
      message: `Application failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};
const applicationFillerTool = createTool({
  id: "application-filler-tool",
  description: "Automatically fills job application forms on LinkedIn and Naukri using resume data",
  inputSchema: z.object({
    jobUrl: z.string().describe("URL of the job posting to apply to"),
    resumeData: z.object({
      personalInfo: z.object({
        name: z.string(),
        email: z.string(),
        phone: z.string(),
        location: z.string(),
        linkedIn: z.string().optional(),
        github: z.string().optional()
      }),
      summary: z.string(),
      experience: z.array(z.object({
        title: z.string(),
        company: z.string(),
        duration: z.string(),
        description: z.string()
      })),
      skills: z.array(z.string()),
      education: z.array(z.object({
        degree: z.string(),
        institution: z.string(),
        year: z.string()
      }))
    })
  }),
  outputSchema: z.object({
    jobUrl: z.string(),
    status: z.enum(["applied", "failed", "already_applied"]),
    message: z.string(),
    timestamp: z.string()
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { jobUrl, resumeData } = context;
    logger?.info("\u{1F527} [ApplicationFiller] Starting application process", { jobUrl });
    let browser = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
      });
      const page = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36");
      let result;
      if (jobUrl.includes("linkedin.com")) {
        result = await fillLinkedInApplication(jobUrl, resumeData, page, logger);
      } else if (jobUrl.includes("naukri.com")) {
        result = await fillNaukriApplication(jobUrl, resumeData, page, logger);
      } else {
        result = {
          jobUrl,
          status: "failed",
          message: "Unsupported job site. Only LinkedIn and Naukri are supported."
        };
      }
      logger?.info("\u2705 [ApplicationFiller] Application process completed", {
        jobUrl,
        status: result.status,
        message: result.message
      });
      return {
        ...result,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
    } catch (error) {
      logger?.error("\u274C [ApplicationFiller] Application process failed", {
        jobUrl,
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        jobUrl,
        status: "failed",
        message: `Application failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
});

export { applicationFillerTool };
//# sourceMappingURL=04f1cf85-383f-42f2-aa57-da5637c44e9d.mjs.map
