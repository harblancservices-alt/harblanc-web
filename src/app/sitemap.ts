import type { MetadataRoute } from "next";

/**
 * Minimal sitemap for harblancservices.com. Add new public routes here
 * as they ship. The `lastModified` is set at request time so deploys
 * automatically refresh the timestamp — no manual bookkeeping.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://harblancservices.com";
  const now = new Date();

  return [
    {
      url: base,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 1.0,
    },
    {
      url: `${base}/quote`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${base}/apply`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
