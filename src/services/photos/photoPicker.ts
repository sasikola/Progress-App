import {
  launchCamera,
  launchImageLibrary,
  type ImageLibraryOptions,
} from 'react-native-image-picker';
import { selectedPhoto } from './model';

export class PhotoPermissionError extends Error {}
const options: ImageLibraryOptions = {
  mediaType: 'photo',
  selectionLimit: 1,
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.8,
  includeBase64: true,
  includeExtra: false,
  assetRepresentationMode: 'compatible',
};
export async function pickPhoto(source: 'camera' | 'library') {
  const response =
    source === 'camera'
      ? await launchCamera({
          ...options,
          saveToPhotos: false,
          cameraType: 'back',
        })
      : await launchImageLibrary(options);
  if (response.didCancel) return null;
  if (response.errorCode === 'permission')
    throw new PhotoPermissionError(
      'Photo access is denied. Allow access in Settings, then try again.',
    );
  if (response.errorCode === 'camera_unavailable')
    throw new Error(
      'No camera is available. Choose a photo from your library instead.',
    );
  if (response.errorCode)
    throw new Error(
      'Could not open the photo picker. Try again or choose another source.',
    );
  return selectedPhoto(response.assets?.[0]);
}
