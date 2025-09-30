import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { Component, NgZone, OnDestroy } from '@angular/core';
import { DoublyLinkedList, DoublyLinkedListNode } from './models/doubly-linked-list';
import { Track } from './models/track.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnDestroy {
  tracks: Track[] = [];
  currentTrackIndex = -1;
  isPlaying = false;
  isLoadingTrack = false;
  currentTime = 0;
  duration = 0;
  volume = 0.8;

  private readonly audio = new Audio();
  private readonly boundTimeUpdate = () => this.onTimeUpdate();
  private readonly boundEnded = () => this.onTrackEnded();
  private readonly boundLoadedMetadata = () => this.onLoadedMetadata();
  private readonly playlist = new DoublyLinkedList<Track>();
  private currentNode: DoublyLinkedListNode<Track> | null = null;
  private readonly latin1Decoder: TextDecoder | null = typeof TextDecoder !== 'undefined' ? new TextDecoder('iso-8859-1') : null;

  constructor(private readonly zone: NgZone) {
    this.audio.preload = 'metadata';
    this.audio.volume = this.volume;
    this.audio.addEventListener('timeupdate', this.boundTimeUpdate);
    this.audio.addEventListener('ended', this.boundEnded);
    this.audio.addEventListener('loadedmetadata', this.boundLoadedMetadata);
  }

  get currentTrack(): Track | null {
    return this.currentNode?.value ?? null;
  }

  async onFilesSelected(event: Event): Promise<void> {
    const element = event.target as HTMLInputElement;
    const files = Array.from(element.files ?? []);

    if (!files.length) {
      return;
    }

    const uniqueAudioFiles = files
      .filter(file => file.type.startsWith('audio/'))
      .filter(file => !this.tracks.some(track => track.file.name === file.name && track.file.size === file.size));

    if (!uniqueAudioFiles.length) {
      element.value = '';
      return;
    }

    const newTracks = await Promise.all(uniqueAudioFiles.map(file => this.createTrackFromFile(file)));

    if (!newTracks.length) {
      element.value = '';
      return;
    }

    let firstInsertedNode: DoublyLinkedListNode<Track> | null = null;
    newTracks.forEach(track => {
      const node = this.playlist.insertAtEnd(track);
      if (!firstInsertedNode) {
        firstInsertedNode = node;
      }
    });

    this.refreshPlaylistSnapshot();

    if (!this.currentNode) {
      const nodeToPlay = firstInsertedNode ?? this.playlist.getHead();
      if (nodeToPlay) {
        this.selectNode(nodeToPlay, true);
      }
    }

    element.value = '';
  }
  playTrack(index: number): void {
    if (index < 0 || index >= this.tracks.length) {
      return;
    }

    const node = this.playlist.getNodeAt(index);
    if (!node) {
      return;
    }

    this.selectNode(node, true);
  }

  togglePlayback(): void {
    if (!this.tracks.length) {
      return;
    }

    if (!this.currentNode) {
      const head = this.playlist.getHead();
      if (head) {
        this.selectNode(head, true);
      }
      return;
    }

    if (this.audio.paused) {
      this.playInternal();
    } else {
      this.audio.pause();
      this.isPlaying = false;
    }
  }

  previousTrack(): void {
    if (!this.currentNode) {
      return;
    }

    if (this.audio.currentTime > 5) {
      this.seekTo(0);
      return;
    }

    const prevNode = this.currentNode.prev;
    if (prevNode) {
      this.selectNode(prevNode, true);
    }
  }

  nextTrack(): void {
    if (!this.currentNode) {
      return;
    }

    const nextNode = this.currentNode.next;
    if (nextNode) {
      this.selectNode(nextNode, true);
    } else {
      this.audio.pause();
      this.isPlaying = false;
      this.seekTo(0);
    }
  }

  removeTrack(index: number): void {
    const node = this.playlist.getNodeAt(index);
    if (!node) {
      return;
    }

    const nextNode = node.next;
    const prevNode = node.prev;
    const wasCurrent = node === this.currentNode;
    const wasPlaying = this.isPlaying;
    const trackToRemove = node.value;

    this.playlist.removeNode(node);
    this.releaseTrackResources(trackToRemove);

    if (wasCurrent) {
      this.audio.pause();
      this.isPlaying = false;
      this.isLoadingTrack = false;

      const replacement = nextNode ?? prevNode ?? null;
      if (replacement) {
        this.selectNode(replacement, wasPlaying);
      } else {
        this.currentNode = null;
        this.currentTrackIndex = -1;
        this.duration = 0;
        this.currentTime = 0;
        this.audio.src = '';
      }
    }

    this.refreshPlaylistSnapshot();
  }

  onQueueDrop(event: CdkDragDrop<Track[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    const movedNode = this.playlist.moveNode(event.previousIndex, event.currentIndex);
    if (!movedNode) {
      return;
    }

    if (this.currentNode === movedNode) {
      this.currentTrackIndex = this.playlist.indexOfNode(this.currentNode);
    }

    this.refreshPlaylistSnapshot();
  }

  seekTo(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    const maxBoundary = Number.isFinite(this.audio.duration) && this.audio.duration > 0 ? this.audio.duration : Math.max(this.duration, value);
    const clampedTime = Math.min(Math.max(value, 0), maxBoundary || value);
    this.audio.currentTime = clampedTime;
    this.currentTime = this.audio.currentTime;
  }

  onSeek(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.seekTo(Number(target.value));
  }

  onVolumeChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const newVolume = Number(target.value);
    this.volume = Math.min(Math.max(newVolume, 0), 1);
    this.audio.volume = this.volume;
  }

  formatTime(timeInSeconds: number): string {
    if (!Number.isFinite(timeInSeconds) || timeInSeconds <= 0) {
      return '0:00';
    }

    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60)
      .toString()
      .padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  isCurrentTrack(index: number): boolean {
    return index === this.currentTrackIndex;
  }

  trackDuration(track: Track): string {
    return track.duration ? this.formatTime(track.duration) : '-';
  }

  ngOnDestroy(): void {
    this.audio.removeEventListener('timeupdate', this.boundTimeUpdate);
    this.audio.removeEventListener('ended', this.boundEnded);
    this.audio.removeEventListener('loadedmetadata', this.boundLoadedMetadata);
    this.audio.pause();
    this.playlist.toArray().forEach(track => this.releaseTrackResources(track));
  }

  private selectNode(node: DoublyLinkedListNode<Track>, shouldPlay: boolean): void {
    const isSameNode = node === this.currentNode;
    this.currentNode = node;
    this.currentTrackIndex = this.playlist.indexOfNode(node);

    if (!isSameNode) {
      const track = node.value;
      this.isLoadingTrack = true;
      this.duration = track.duration ?? 0;
      this.currentTime = 0;
      this.audio.src = track.url;
      this.audio.load();
    }

    if (shouldPlay) {
      this.playInternal();
    } else {
      this.isPlaying = false;
    }
  }

  private refreshPlaylistSnapshot(): void {
    this.tracks = this.playlist.toArray();
    this.currentTrackIndex = this.playlist.indexOfNode(this.currentNode);
  }

  private async createTrackFromFile(file: File): Promise<Track> {
    const fallbackId = file.name + '-' + Date.now();
    const track: Track = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : fallbackId,
      name: file.name.replace(/\.[^.]+$/, ''),
      url: URL.createObjectURL(file),
      file
    };

    if (this.shouldExtractArtwork(file)) {
      const artworkUrl = await this.extractArtworkUrl(file);
      if (artworkUrl) {
        track.artworkUrl = artworkUrl;
      }
    }

    return track;
  }

  private releaseTrackResources(track: Track): void {
    URL.revokeObjectURL(track.url);
    if (track.artworkUrl) {
      URL.revokeObjectURL(track.artworkUrl);
    }
  }

  private shouldExtractArtwork(file: File): boolean {
    const type = file.type?.toLowerCase() ?? '';
    if (type === 'audio/mpeg' || type === 'audio/mp3') {
      return true;
    }

    return file.name.toLowerCase().endsWith('.mp3');
  }

  private async extractArtworkUrl(file: File): Promise<string | undefined> {
    const headerBuffer = await file.slice(0, 10).arrayBuffer();
    if (headerBuffer.byteLength < 10) {
      return undefined;
    }

    const header = new Uint8Array(headerBuffer);
    if (header[0] !== 0x49 || header[1] !== 0x44 || header[2] !== 0x33) {
      return undefined;
    }

    const version = header[3];
    if (version < 3) {
      return undefined;
    }

    const flags = header[5];
    const tagSize = this.readSynchsafeInteger(header, 6);
    if (!tagSize) {
      return undefined;
    }

    const tagBuffer = await file.slice(10, 10 + tagSize).arrayBuffer();
    if (!tagBuffer.byteLength) {
      return undefined;
    }

    let tagLength = tagBuffer.byteLength;
    if ((flags & 0x10) !== 0 && tagLength >= 10) {
      tagLength -= 10;
    }

    const tag = new Uint8Array(tagBuffer, 0, tagLength);
    const view = new DataView(tagBuffer, 0, tagLength);

    let offset = 0;
    if ((flags & 0x40) !== 0 && tag.length >= 4) {
      if (version === 3 && tag.length >= 4) {
        const extSize = view.getUint32(0);
        offset = Math.min(extSize + 4, tag.length);
      } else if (version === 4) {
        const extSize = this.readSynchsafeFromView(view, 0);
        offset = Math.min(extSize, tag.length);
      }
    }

    while (offset + 10 <= tag.length) {
      if (tag[offset] === 0) {
        break;
      }

      const frameId = this.decodeFrameId(tag, offset);
      if (!frameId) {
        break;
      }

      const frameSize = version === 4
        ? this.readSynchsafeFromView(view, offset + 4)
        : view.getUint32(offset + 4);

      if (!frameSize || frameSize < 1) {
        break;
      }

      const frameDataStart = offset + 10;
      const frameDataEnd = frameDataStart + frameSize;
      if (frameDataEnd > tag.length) {
        break;
      }

      if (frameId === 'APIC') {
        const frameData = tag.subarray(frameDataStart, frameDataEnd);
        const artworkUrl = this.parseApicFrame(frameData);
        if (artworkUrl) {
          return artworkUrl;
        }
      }

      offset = frameDataEnd;
    }

    return undefined;
  }

  private parseApicFrame(frameData: Uint8Array): string | undefined {
    if (frameData.length < 4) {
      return undefined;
    }

    const textEncoding = frameData[0];
    let cursor = 1;

    const mimeTerminator = frameData.indexOf(0, cursor);
    if (mimeTerminator === -1) {
      return undefined;
    }

    const mimeBytes = frameData.subarray(cursor, mimeTerminator);
    const mimeType = (this.latin1Decoder?.decode(mimeBytes).trim() || 'image/jpeg').toLowerCase();
    cursor = mimeTerminator + 1;

    if (cursor >= frameData.length) {
      return undefined;
    }

    cursor += 1;
    cursor = this.advancePastEncodedString(frameData, cursor, frameData.length, textEncoding);
    if (cursor >= frameData.length) {
      return undefined;
    }

    const imageBytes = frameData.subarray(cursor);
    if (!imageBytes.length) {
      return undefined;
    }

    const blob = new Blob([imageBytes], { type: mimeType || 'image/jpeg' });
    return URL.createObjectURL(blob);
  }

  private readSynchsafeInteger(bytes: Uint8Array, offset: number): number {
    if (offset + 4 > bytes.length) {
      return 0;
    }

    return (bytes[offset] << 21)
      | (bytes[offset + 1] << 14)
      | (bytes[offset + 2] << 7)
      | bytes[offset + 3];
  }

  private readSynchsafeFromView(view: DataView, offset: number): number {
    if (offset + 4 > view.byteLength) {
      return 0;
    }

    return (view.getUint8(offset) << 21)
      | (view.getUint8(offset + 1) << 14)
      | (view.getUint8(offset + 2) << 7)
      | view.getUint8(offset + 3);
  }

  private decodeFrameId(bytes: Uint8Array, offset: number): string {
    if (offset + 4 > bytes.length) {
      return '';
    }

    const chars = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    return /^[A-Z0-9]{4}$/.test(chars) ? chars : '';
  }

  private advancePastEncodedString(data: Uint8Array, offset: number, end: number, encoding: number): number {
    if (offset >= end) {
      return end;
    }

    if (encoding === 0 || encoding === 3) {
      while (offset < end && data[offset] !== 0) {
        offset += 1;
      }
      return Math.min(offset + 1, end);
    }

    while (offset + 1 < end) {
      if (data[offset] === 0 && data[offset + 1] === 0) {
        return Math.min(offset + 2, end);
      }
      offset += 2;
    }

    return end;
  }

  private playInternal(): void {
    void this.audio
      .play()
      .then(() => {
        this.zone.run(() => {
          this.isPlaying = true;
          this.isLoadingTrack = false;
        });
      })
      .catch(() => {
        this.zone.run(() => {
          this.isPlaying = false;
          this.isLoadingTrack = false;
        });
      });
  }

  private onLoadedMetadata(): void {
    this.zone.run(() => {
      const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
      this.duration = duration;
      const node = this.currentNode;
      if (node) {
        node.value.duration = duration;
      }
      this.isLoadingTrack = false;
    });
  }

  private onTimeUpdate(): void {
    this.zone.run(() => {
      this.currentTime = this.audio.currentTime;
    });
  }

  private onTrackEnded(): void {
    this.zone.run(() => this.nextTrack());
  }
}











