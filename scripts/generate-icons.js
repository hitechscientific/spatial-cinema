import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workspaceDir = path.resolve(__dirname, '..');
const iconsDir = path.join(workspaceDir, 'public', 'icons');

// 1x1 transparent PNG as default fallback
const fallbackPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// A simple circular cyan/purple neon base64 PNG (approx 48x48) to serve as a nice icon out-of-the-box
const defaultIconBase64 = 
  'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyJpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAAD' +
  'w/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGV4dD0i' +
  'QWRvYmUgWE1QIHRlbXBsYXRlIDEuMC8iPiA8cmRmOlJERiB4bWxuczpydGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2' +
  'NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXBNRD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21ldGFkYXRhLyIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUu' +
  'Y29tL3hhcC8xLjAvIiB4bWxuczp4bXBSUEk9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9yaWdodHMvcHJhY3RpY2VzL2luc3RydWN0aW9uLyIgeG1wTUQ6RG9jdW1lbn' +
  'RJRD0iMTI3MTQ4MDIiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIiB4bXBSUEk6SW5zdHJ1Y3Rpb25zPSJGb3IgZGV2ZWxvcG1lbnQgb25seSIvPiA8L3JkZjpS' +
  'REY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+V1Vd7AAAA51JREFUeNrkWUtIVFEY/s7ceR/T0dLRyBSbykI3hSgSglCDyC3aRLogaFEUtWjTKoJ2tWjTKoJA' +
  'W7QoClq1iGgRglBZEFpEvmJMk/Ex8zH33nN+58w4o8w4d8bRyTkfHDjM3P/7z/fOf9//n3N9vufh8/mQSCSSkE+K+F6J9+K11O+S62RMTU3Bv/1v+S6J18q14vU2aUqjY+PD' +
  'w8PQ3t5uxsfHx2FiYgI4jquV38W0/Dq8hA9gBlyA1v2s7OxsSEhIgLa2NkhJSXGZ50hYh/fhFXgJvRCHv4Y9ZzBvY7jPBRh8j4xXyOf9/f3w5s0bGB0dhcHBQZicnITJyUnI' +
  'ycmBlJQUyM7Ohvz8fCgoKICSkpLIeCYkJMDt27ehpKQE8vLywOfzOcfyLbx9+xbq6+uBZZnbTsd5D/fgCbgD3V+XUe50dHQ4x3U0gwcPHsDU1FSYv5w9Xy9PTEyEyspKePDg' +
  'gXPcxzMYHBwEsT129fX1zrHcj4gM/H6/4P67169fR+Z1NIOxsbEwE4d9m5qaomMRZqCjDwsLi5zv6FhEGFit1n/a7/H3zMzMaFhEDpCenh4W/Wf9Z71rOBZRhpaWFrBarWHR' +
  'f9Z71ruGYxFlKCoqgoyMjLDoP+s9613DsYgylJeXQ2pqavljZtC7hmMRZWBlZQWKiopi2h8ZGZm2/oT9/X2oq6sTUX42jP5kR1wDHoA70O0M5k69ubk5p9tH8yvI6elpyf3T' +
  '0tIcGfQ6eXl5kU/m69evw0y8qKgo51hEUUtLC8zMzEhb39HR4RzL3Yh8n39i5vF/uH37tvO9kZHvF2y3Y/bZgU0/v/V6W3oR2ZkZ9vKzwC8/u8h+q7Dpx6+09CJsj6P22X7F' +
  'b2J5FtkD22L/7O9r1tvWi8ju+5l91p/2P+tdw7GIMoj19+sR2x/bI/u7mvW+9SIy2D0R6//aR/bLfq5mvWe9azgWUYauri7k3t/+FfZ5f9rvH633rBcxOzsbsV9hL2yf9af9' +
  'nvW29SJSWVkp2G1/vQ/sD/vDfq5mvWe9iKmpKeG1k4qf7Zf9sX/2xzXrbes/4/Pz85CbmysNCPvMftkf+2R/XLPetv6TzF5K5Fv8E15L/S55E9Wf5nQoR5mQ5E3n1tE72iIe' +
  'i9d6k2T/K/LfkD8F+XKQn8g1gAEA7y090W3WpQ4AAAAASUVORK5CYII=';

// Create icons directory in workspace (public/icons)
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const writeIcon = (filePath, base64Content) => {
  fs.writeFileSync(filePath, Buffer.from(base64Content, 'base64'));
  console.log(`Wrote icon: ${filePath}`);
};

// Write default circular icons to public/icons
const sizes = [16, 48, 128];
sizes.forEach(size => {
  const iconName = `icon${size}.png`;
  const workspacePath = path.join(iconsDir, iconName);
  const base64Data = defaultIconBase64;
  
  writeIcon(workspacePath, base64Data);
});

// Try to copy the generated logo if it exists (using a general lookup)
const geminiDir = path.resolve(process.env.USERPROFILE || 'C:\\Users\\hitec', '.gemini', 'antigravity', 'brain');
if (fs.existsSync(geminiDir)) {
  try {
    const files = fs.readdirSync(geminiDir);
    const logoFile = files.find(f => f.startsWith('cinematic_surround_logo_') && f.endsWith('.png'));
    if (logoFile) {
      const srcPath = path.join(geminiDir, logoFile);
      console.log(`Found generated premium logo at: ${srcPath}`);
      
      // Copy to public/icons/logo.png for backup/UI reference
      fs.copyFileSync(srcPath, path.join(iconsDir, 'logo.png'));
      console.log(`Copied premium logo to public/icons/logo.png`);
    }
  } catch (err) {
    console.warn('Could not read gemini brain directory for premium logo, using default styled icon.', err);
  }
}

console.log('Icon generation script completed successfully.');
