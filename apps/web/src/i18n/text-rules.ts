/** Liczba zdań w tekście (kropka / ! / ? kończące zdanie, nie skrót typu „maks.” czy „np.”). Używane w testach treści. */
export function sentences(text: string): number {
  return text.match(/[.!?](?=\s+[A-ZĄĆĘŁŃÓŚŹŻ„“"]|\s*$)/g)?.length ?? 0;
}
