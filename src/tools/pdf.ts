import type { ToolSet } from "ai";
import { discordClient } from "#/services/discord";
import { renderHtmlToPdf } from "#/utils/html-to-pdf";
import { tool } from "ai";
import { z } from "zod";

export const pdfTools: ToolSet = {
  generatePdf: tool({
    description: "Render a complete HTML document to a PDF file and upload it to a Discord channel. The HTML must be a full document (DOCTYPE, <head> with embedded CSS, <body>) and images must use absolute URLs (fetch them with searchImage first). After uploading, reply only that the PDF is available as an attachment. Never invent technical problems and never propose an alternative.",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to upload the PDF to"),
      html: z.string().describe("The complete HTML document to render"),
      filename: z.string().describe("The PDF file name without extension (e.g. 'monthly-report')"),
      options: z.object({
        format: z.enum(["A4", "A3", "A5", "Letter", "Legal", "Tabloid"]).optional().describe("Page format (default: A4)"),
        landscape: z.boolean().optional().describe("Landscape orientation (default: false)"),
        margin: z.object({
          top: z.string().optional().describe("Top margin (e.g. '20mm', '1in', '2cm')"),
          right: z.string().optional().describe("Right margin"),
          bottom: z.string().optional().describe("Bottom margin"),
          left: z.string().optional().describe("Left margin"),
        }).optional().describe("Custom margins (default: 10mm on all sides)"),
        displayHeaderFooter: z.boolean().optional().describe("Display header and footer (default: false)"),
        headerTemplate: z.string().optional().describe("HTML template for the header (requires displayHeaderFooter)"),
        footerTemplate: z.string().optional().describe("HTML template for the footer (requires displayHeaderFooter). Use <span class='pageNumber'></span> and <span class='totalPages'></span> for page numbers"),
        printBackground: z.boolean().optional().describe("Print background colors and images (default: true)"),
        scale: z.number().min(0.1).max(2).optional().describe("Rendering scale, 0.1 to 2 (default: 1)"),
      }).optional().describe("PDF generation options"),
    }),
    outputSchema: z.object({
      filename: z.string().describe("Uploaded file name"),
      size: z.number().describe("File size in bytes"),
      messageId: z.string().describe("Uploaded message ID"),
    }),
    execute: async ({ channelId, html, filename, options }) => {
      const pdf = await renderHtmlToPdf(html, options ?? {});

      const channel = discordClient.channels.cache.get(channelId);
      if (channel?.isTextBased() !== true) {
        throw new Error("Channel not found or not a text channel");
      }
      if (!("send" in channel)) {
        throw new Error("Channel does not support sending messages");
      }

      const pdfFilename = `${filename.replace(/[^a-zA-Z0-9-_]/gu, "-")}.pdf`;
      const message = await channel.send({ files: [{ name: pdfFilename, attachment: pdf }] });

      return {
        filename: pdfFilename,
        size: pdf.length,
        messageId: message.id,
      };
    },
  }),
};
