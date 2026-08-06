"use server";

import { searchWorkspace as searchWorkspaceData, type SearchResults } from "@/lib/data/search";

export async function searchWorkspace(query: string): Promise<SearchResults> {
  return searchWorkspaceData(query);
}
