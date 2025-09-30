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

  onFilesSelected(event: Event): void {
    const element = event.target as HTMLInputElement;
    const files = Array.from(element.files ?? []);

    if (!files.length) {
      return;
    }

    const newTracks = files
      .filter(file => file.type.startsWith('audio/'))
      .filter(file => !this.tracks.some(track => track.file.name === file.name && track.file.size === file.size))
      .map(file => ({
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${file.name}-${Date.now()}`,
        name: file.name.replace(/\.[^.]+$/, ''),
        url: URL.createObjectURL(file),
        file
      } satisfies Track));

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
    URL.revokeObjectURL(trackToRemove.url);

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
    this.playlist.toArray().forEach(track => URL.revokeObjectURL(track.url));
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
