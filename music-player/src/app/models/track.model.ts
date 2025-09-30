export interface Track {
  id: string;
  name: string;
  url: string;
  file: File;
  duration?: number;
  artworkUrl?: string;
}
