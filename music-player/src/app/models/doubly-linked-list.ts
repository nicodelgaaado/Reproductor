export interface DoublyLinkedListNode<T> {
  value: T;
  next: DoublyLinkedListNode<T> | null;
  prev: DoublyLinkedListNode<T> | null;
}

export class DoublyLinkedList<T> {
  private head: DoublyLinkedListNode<T> | null = null;
  private tail: DoublyLinkedListNode<T> | null = null;
  private length = 0;

  get size(): number {
    return this.length;
  }

  getHead(): DoublyLinkedListNode<T> | null {
    return this.head;
  }

  getTail(): DoublyLinkedListNode<T> | null {
    return this.tail;
  }

  insertAtStart(value: T): DoublyLinkedListNode<T> {
    const node = this.createNode(value);

    if (!this.head) {
      this.head = node;
      this.tail = node;
    } else {
      node.next = this.head;
      this.head.prev = node;
      this.head = node;
    }

    this.length += 1;
    return node;
  }

  insertAtEnd(value: T): DoublyLinkedListNode<T> {
    const node = this.createNode(value);

    if (!this.tail) {
      this.head = node;
      this.tail = node;
    } else {
      node.prev = this.tail;
      this.tail.next = node;
      this.tail = node;
    }

    this.length += 1;
    return node;
  }

  insertAt(value: T, index: number): DoublyLinkedListNode<T> {
    if (index <= 0 || !this.head) {
      return this.insertAtStart(value);
    }

    if (index >= this.length) {
      return this.insertAtEnd(value);
    }

    const current = this.getNodeAt(index);
    if (!current) {
      return this.insertAtEnd(value);
    }

    const node = this.createNode(value);
    node.prev = current.prev;
    node.next = current;

    if (current.prev) {
      current.prev.next = node;
    }

    current.prev = node;
    this.length += 1;
    return node;
  }

  getNodeAt(index: number): DoublyLinkedListNode<T> | null {
    if (index < 0 || index >= this.length) {
      return null;
    }

    let current: DoublyLinkedListNode<T> | null;
    let steps: number;

    if (index <= this.length / 2) {
      current = this.head;
      steps = index;
      while (steps > 0 && current) {
        current = current.next;
        steps -= 1;
      }
    } else {
      current = this.tail;
      steps = this.length - 1 - index;
      while (steps > 0 && current) {
        current = current.prev;
        steps -= 1;
      }
    }

    return current;
  }

  indexOfNode(node: DoublyLinkedListNode<T> | null): number {
    if (!node) {
      return -1;
    }

    let current = this.head;
    let index = 0;

    while (current) {
      if (current === node) {
        return index;
      }

      current = current.next;
      index += 1;
    }

    return -1;
  }

  moveNode(fromIndex: number, toIndex: number): DoublyLinkedListNode<T> | null {
    if (fromIndex === toIndex) {
      return this.getNodeAt(fromIndex);
    }

    const node = this.getNodeAt(fromIndex);
    if (!node) {
      return null;
    }

    this.detachNode(node);

    let targetIndex = toIndex;
    if (targetIndex < 0) {
      targetIndex = 0;
    }

    if (targetIndex > this.length) {
      targetIndex = this.length;
    }

    if (!this.head || this.length === 0) {
      this.head = node;
      this.tail = node;
      this.length = 1;
      return node;
    }

    if (targetIndex === 0) {
      node.next = this.head;
      this.head.prev = node;
      this.head = node;
    } else if (targetIndex === this.length) {
      node.prev = this.tail;
      if (this.tail) {
        this.tail.next = node;
      }
      this.tail = node;
    } else {
      const target = this.getNodeAt(targetIndex);
      if (!target) {
        node.prev = this.tail;
        if (this.tail) {
          this.tail.next = node;
        }
        this.tail = node;
      } else {
        node.next = target;
        node.prev = target.prev;
        if (target.prev) {
          target.prev.next = node;
        } else {
          this.head = node;
        }
        target.prev = node;
      }
    }

    this.length += 1;
    return node;
  }

  removeNode(node: DoublyLinkedListNode<T> | null): DoublyLinkedListNode<T> | null {
    if (!node) {
      return null;
    }

    this.detachNode(node);
    node.next = null;
    node.prev = null;
    return node;
  }

  removeAt(index: number): DoublyLinkedListNode<T> | null {
    const node = this.getNodeAt(index);
    return this.removeNode(node);
  }

  toArray(): T[] {
    const result: T[] = [];
    let current = this.head;

    while (current) {
      result.push(current.value);
      current = current.next;
    }

    return result;
  }

  private detachNode(node: DoublyLinkedListNode<T>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    this.length = Math.max(0, this.length - 1);
    node.next = null;
    node.prev = null;
  }

  private createNode(value: T): DoublyLinkedListNode<T> {
    return { value, next: null, prev: null };
  }
}
