import type { ResponseSpec } from './schema';

export interface ResponseAffordances {
  text: boolean;
  choice: boolean;
  photo: boolean;
}

export function responseAffordances(response: ResponseSpec): ResponseAffordances {
  switch (response.mode) {
    case 'none':
      return { text: false, choice: false, photo: false };
    case 'text':
      return { text: true, choice: false, photo: false };
    case 'choice':
      return { text: false, choice: true, photo: false };
    case 'photo':
      return { text: false, choice: false, photo: true };
    case 'mixed':
      return {
        text: response.parts.includes('text'),
        choice: response.parts.includes('choice'),
        photo: response.parts.includes('photo'),
      };
  }
}
