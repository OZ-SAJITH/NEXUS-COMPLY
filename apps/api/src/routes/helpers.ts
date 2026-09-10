export function handleError(
  res: { status: (c: number) => { json: (o: unknown) => void } },
  message: string,
  code = 400
): void {
  res.status(code).json({ error: message });
}