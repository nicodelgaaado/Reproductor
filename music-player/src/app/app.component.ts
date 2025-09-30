import { CommonModule } from '@angular/common';
import { Component, NgZone, OnDestroy } from '@angular/core';
import { Track } from './models/track.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
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

  constructor(private readonly zone: NgZone) {
    this.audio.preload = 'metadata';
    this.audio.volume = this.volume;
    this.audio.addEventListener('timeupdate', this.boundTimeUpdate);
    this.audio.addEventListener('ended', this.boundEnded);
    this.audio.addEventListener('loadedmetadata', this.boundLoadedMetadata);
  }

  get currentTrack(): Track | null {
    if (this.currentTrackIndex === -1) {
      return null;
    }

    return this.tracks[this.currentTrackIndex] ?? null;
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

    this.tracks = [...this.tracks, ...newTracks];

    if (this.currentTrackIndex === -1) {
      this.playTrack(0);
    }

    element.value = '';
  }

  playTrack(index: number): void {
    if (index < 0 || index >= this.tracks.length) {
      return;
    }

    const selectedTrack = this.tracks[index];
    const isSameTrack = index === this.currentTrackIndex;

    if (!isSameTrack) {
      this.currentTrackIndex = index;
      this.isLoadingTrack = true;
      this.duration = selectedTrack.duration ?? 0;
      this.currentTime = 0;
      this.audio.src = selectedTrack.url;
      this.audio.load();
    }

    this.playInternal();
  }

  togglePlayback(): void {
    if (!this.tracks.length) {
      return;
    }

    if (this.currentTrackIndex === -1) {
      this.playTrack(0);
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
    if (this.currentTrackIndex === -1) {
      return;
    }

    if (this.audio.currentTime > 5) {
      this.seekTo(0);
      return;
    }

    const prevIndex = this.currentTrackIndex - 1;
    if (prevIndex >= 0) {
      this.playTrack(prevIndex);
    }
  }

  nextTrack(): void {
    if (this.currentTrackIndex === -1) {
      return;
    }

    const nextIndex = this.currentTrackIndex + 1;
    if (nextIndex < this.tracks.length) {
      this.playTrack(nextIndex);
    } else {
      this.audio.pause();
      this.isPlaying = false;
      this.seekTo(0);
    }
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
    return track.duration ? this.formatTime(track.duration) : '—';
  }

  ngOnDestroy(): void {
    this.audio.removeEventListener('timeupdate', this.boundTimeUpdate);
    this.audio.removeEventListener('ended', this.boundEnded);
    this.audio.removeEventListener('loadedmetadata', this.boundLoadedMetadata);
    this.audio.pause();
    this.tracks.forEach(track => URL.revokeObjectURL(track.url));
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
      const track = this.currentTrack;
      if (track) {
        track.duration = duration;
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