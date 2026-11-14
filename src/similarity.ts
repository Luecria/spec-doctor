/**
 * Similarity and text normalization utilities for duplicate detection.
 * Implements the Duplicate Detection Algorithm from design.md:
 * - Normalization: lowercase, strip punctuation, collapse whitespace
 * - Similarity: Jaccard similarity over token sets
 * - Threshold: > 0.90 flags as duplicate
 */

/**
 * Normalizes text for duplicate detection.
 * Steps:
 * 1. Convert to lowercase
 * 2. Strip punctuation (keep alphanumeric and spaces)
 * 3. Collapse multiple spaces to single space
 * 4. Trim leading/trailing whitespace
 *
 * @param text The text to normalize
 * @returns Normalized text
 */
export function normalizeText(text: string): string {
  return (
    text
      .toLowerCase()
      // Strip punctuation: keep alphanumeric, spaces, hyphens
      .replace(/[^\w\s-]/g, '')
      // Collapse multiple spaces
      .replace(/\s+/g, ' ')
      // Trim
      .trim()
  );
}

/**
 * Computes Jaccard similarity between two text samples.
 * Jaccard(A, B) = |A ∩ B| / |A ∪ B|
 *
 * Algorithm:
 * 1. Normalize both texts
 * 2. Split into token sets (by whitespace)
 * 3. Compute intersection and union of token sets
 * 4. Return |intersection| / |union|
 *
 * @param textA First text to compare
 * @param textB Second text to compare
 * @returns Jaccard similarity score (0-1)
 */
export function jaccardSimilarity(textA: string, textB: string): number {
  const normA = normalizeText(textA);
  const normB = normalizeText(textB);

  if (normA.length === 0 && normB.length === 0) {
    return 1.0; // Both empty = identical
  }

  if (normA.length === 0 || normB.length === 0) {
    return 0.0; // One empty, one not = completely different
  }

  // Split into token sets
  const tokensA = new Set(normA.split(/\s+/));
  const tokensB = new Set(normB.split(/\s+/));

  // Compute intersection
  const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)));

  // Compute union
  const union = new Set([...tokensA, ...tokensB]);

  // Jaccard similarity
  return intersection.size / union.size;
}

/**
 * Finds all duplicate or near-duplicate pairs in a list of texts.
 * A pair is considered a duplicate if Jaccard similarity > threshold.
 *
 * @param items Array of objects with id and text properties
 * @param threshold Similarity threshold (default: 0.90)
 * @returns Array of duplicate pairs with similarity scores and excerpt
 */
export function findDuplicates(
  items: Array<{ id: string; text: string }>,
  threshold: number = 0.90
): Array<{ id1: string; id2: string; similarity: number; excerpt: string }> {
  const duplicates: Array<{ id1: string; id2: string; similarity: number; excerpt: string }> =
    [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const similarity = jaccardSimilarity(items[i].text, items[j].text);

      if (similarity > threshold) {
        // Extract first 120 characters as excerpt
        const excerpt = items[i].text.substring(0, 120);
        duplicates.push({
          id1: items[i].id,
          id2: items[j].id,
          similarity,
          excerpt,
        });
      }
    }
  }

  return duplicates;
}
