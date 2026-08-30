export function createSerialQueue() {
  let tail = Promise.resolve();
  return function enqueue<T>(operation: () => Promise<T>) {
    const result = tail.then(operation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}
