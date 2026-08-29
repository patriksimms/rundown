export function createHealthResponse() {
  return Response.json(
    {
      service: 'rundown',
      status: 'ok',
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
