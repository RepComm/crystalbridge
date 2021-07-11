

export class Queue<T> {
  private array: Array<T>;
  constructor () {
    this.array = new Array<T>();
  }
  enqueue (...items: Array<T>): this {
    this.array.push(...items);
    return this;
  }
  dequeue (): T {
    return this.array.shift();
  }
  isEmpty (): boolean {
    return this.array.length < 1;
  }
}
