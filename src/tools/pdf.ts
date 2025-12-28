import type { ToolSet } from "ai";
import { tool } from "ai";
import puppeteer from "puppeteer";
import { z } from "zod";
import { AttachmentBuilder } from "discord.js";
import { discordClient } from "#/discord/client";


export const pdfTools: ToolSet = {
    generatePDF: tool({
        description: `GÉNÈRE UN PDF PROFESSIONNEL - CE TOOL FONCTIONNE PARFAITEMENT.

Tu DOIS créer un HTML COMPLET avec cette structure:
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 30px; }
        /* Ajoute ton CSS moderne ici (flexbox, grid, couleurs, etc.) */
    </style>
</head>
<body>
    <!-- Ton contenu HTML structuré ici -->
</body>
</html>

IMPORTANT POUR LES IMAGES (logos, icônes, illustrations):
- Pour les LOGOS D'ENTREPRISES: utilise OBLIGATOIREMENT le tool searchBrandLogo
  Exemple: si le PDF mentionne "Basic-Fit", appelle searchBrandLogo avec brandName="Basic-Fit"
  Le tool retournera une URL directe du logo à utiliser dans le HTML
- Pour d'autres images: utilise websearch pour trouver des URLs directes (.png, .svg, .jpg, .webp)
- Utilise toujours des URLs absolues complètes (ex: https://example.com/logo.png)
- Privilégie les formats vectoriels (.svg) pour une meilleure qualité
- Exemple: <img src="https://img.logo.dev/company.com" alt="Logo" style="width: 100px;">

Le PDF sera uploadé directement sur Discord dans le channel spécifié.
N'INVENTE PAS de problèmes techniques - ce tool fonctionne.
NE LAISSE AUCUN PLACEHOLDER le but est que tu remplisse / imagine 100% du pdf`,
        inputSchema: z.object({
            channelId: z.string().describe("L'ID du channel Discord où uploader le PDF"),
            html: z.string().describe("Le contenu HTML complet du document. DOIT inclure <!DOCTYPE html>, <html>, <head> avec <style> pour le CSS, et <body>. Utilise du CSS moderne pour le style (flexbox, grid, etc.). Pour les images, utilise des URLs absolues ou data URIs."),
            filename: z.string().describe("Le nom du fichier PDF (sans extension, elle sera ajoutée automatiquement). Ex: 'rapport-mensuel', 'facture-2024-01'"),
            options: z.object({
                format: z.enum(["A4", "A3", "A5", "Letter", "Legal", "Tabloid"]).optional().describe("Format de page (défaut: A4)"),
                landscape: z.boolean().optional().describe("Orientation paysage (défaut: false = portrait)"),
                margin: z.object({
                    top: z.string().optional().describe("Marge haute (ex: '20mm', '1in', '2cm')"),
                    right: z.string().optional().describe("Marge droite"),
                    bottom: z.string().optional().describe("Marge basse"),
                    left: z.string().optional().describe("Marge gauche"),
                }).optional().describe("Marges personnalisées (défaut: 10mm partout)"),
                displayHeaderFooter: z.boolean().optional().describe("Afficher en-tête et pied de page (défaut: false)"),
                headerTemplate: z.string().optional().describe("Template HTML pour l'en-tête (si displayHeaderFooter = true)"),
                footerTemplate: z.string().optional().describe("Template HTML pour le pied de page (si displayHeaderFooter = true). Utilise <span class='pageNumber'></span> pour le numéro de page et <span class='totalPages'></span> pour le total"),
                printBackground: z.boolean().optional().describe("Imprimer les couleurs et images de fond (défaut: true)"),
                scale: z.number().optional().describe("Échelle de rendu (0.1 à 2, défaut: 1)"),
            }).optional().describe("Options de génération du PDF"),
        }),
        execute: async ({ channelId, html, filename, options = {} }) => {
            const sanitizedFilename = filename.replace(/[^a-zA-Z0-9-_]/g, "-");
            const pdfFilename = `${Date.now()}-${sanitizedFilename}.pdf`;

            let browser;
            try {
                browser = await puppeteer.launch({
                    headless: true,
                    args: [
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-gpu",
                    ],
                });

                const page = await browser.newPage();

                await page.setContent(html, {
                    waitUntil: ["networkidle0", "domcontentloaded"],
                });

                await page.evaluateHandle("document.fonts.ready");

                await page.waitForFunction(`
                    Array.from(document.querySelectorAll("img")).every(img => img.complete && img.naturalHeight !== 0)
                `, { timeout: 10000 }).catch(() => {
                    console.warn("Some images may not have loaded completely");
                });

                const pdfOptions: Parameters<typeof page.pdf>[0] = {
                    format: options.format || "A4",
                    landscape: options.landscape || false,
                    margin: {
                        top: options.margin?.top || "10mm",
                        right: options.margin?.right || "10mm",
                        bottom: options.margin?.bottom || "10mm",
                        left: options.margin?.left || "10mm",
                    },
                    printBackground: options.printBackground !== false,
                    displayHeaderFooter: options.displayHeaderFooter || false,
                    headerTemplate: options.headerTemplate || "",
                    footerTemplate: options.footerTemplate || "",
                    scale: options.scale || 1,
                    preferCSSPageSize: false,
                };

                const pdfBuffer = await page.pdf(pdfOptions);

                await browser.close();
                browser = undefined;

                const channel = discordClient.channels.cache.get(channelId);
                if (!channel?.isTextBased()) {
                    throw new Error("Channel not found or not a text channel");
                }

                const attachment = new AttachmentBuilder(Buffer.from(pdfBuffer), { name: pdfFilename });

                if ("send" in channel) {
                    await channel.send({ files: [attachment] });
                }

                return {
                    success: true,
                    filename: pdfFilename,
                    size: pdfBuffer.length,
                    channelId: channelId,
                };
            }
            catch (error) {
                if (browser) {
                    await browser.close();
                }
                throw new Error(`Erreur lors de la génération du PDF: ${error instanceof Error ? error.message : String(error)}`);
            }
        },
    }),
};
