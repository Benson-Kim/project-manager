import { installSelfHostedFonts } from "./excalidraw-fonts";

(window as { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";
installSelfHostedFonts(window);
