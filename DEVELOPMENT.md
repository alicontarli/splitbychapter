# Development Guide

This document provides detailed setup and development instructions for contributors.

## Prerequisites

- Node.js 18+ ([Download](https://nodejs.org/))
- npm 9+ (comes with Node.js)
- A code editor (VS Code recommended)
- Git for version control

## Local Setup

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/splitbychapter.git
cd splitbychapter
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` to see the app.

### 4. (Optional) Firebase Setup

If you want to test Firebase integration:

1. Create a Firebase project at [firebase.google.com](https://firebase.google.com)
2. Copy `.env.local.example` to `.env.local`
3. Fill in your Firebase credentials
4. Enable Firestore and Storage in Firebase Console

```bash
cp .env.local.example .env.local
# Edit .env.local with your Firebase config
```

## Project Structure Explained

```
src/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx         # Root layout component
│   ├── page.tsx           # Main page (home)
│   └── api/               # API routes (future)
│
├── components/            # Reusable React components
│   ├── FileUpload.tsx     # Drag-and-drop file upload
│   ├── ToCTreeView.tsx    # Interactive ToC tree view
│   └── ...                # Other components
│
└── lib/                   # Utility functions
    ├── pdfUtils.ts        # PDF parsing & manipulation
    ├── firebaseConfig.ts  # Firebase initialization (future)
    └── types.ts           # TypeScript type definitions
```

## Available Scripts

```bash
npm run dev        # Start development server (port 3000)
npm run build      # Build for production
npm start          # Run production server
npm run lint       # Run ESLint
```

## Code Style

- **Language:** TypeScript (use types everywhere)
- **Framework:** React with Hooks
- **Styling:** Tailwind CSS utility classes
- **Naming:** camelCase for variables/functions, PascalCase for components
- **Imports:** Use path aliases (`@/components`, `@/lib`)

### Example Component

```typescript
'use client';

import React, { useState } from 'react';

interface MyComponentProps {
  title: string;
  onAction?: (value: string) => void;
}

export default function MyComponent({ title, onAction }: MyComponentProps) {
  const [state, setState] = useState<string>('');

  const handleClick = () => {
    onAction?.(state);
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h2 className="text-lg font-semibold">{title}</h2>
      <button
        onClick={handleClick}
        className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Click me
      </button>
    </div>
  );
}
```

## Working with PDF Utilities

### Extracting PDF Data

```typescript
import { extractPDFMetadata } from '@/lib/pdfUtils';

const handlePdfUpload = async (file: File) => {
  try {
    const metadata = await extractPDFMetadata(file);
    console.log('PDF Title:', metadata.title);
    console.log('Table of Contents:', metadata.toc);
  } catch (error) {
    console.error('Error processing PDF:', error);
  }
};
```

### Manipulating ToC Tree

```typescript
import {
  updateCheckedState,
  toggleExpanded,
  getSelectedItems,
} from '@/lib/pdfUtils';

// Check a specific item and cascade to children
const updated = updateCheckedState(toc, 'item-id', true, true);

// Toggle expansion
const toggled = toggleExpanded(updated, 'item-id');

// Get only selected items
const selected = getSelectedItems(toggled);
```

## Development Workflow

### 1. Creating a New Component

```bash
# Create in src/components/MyComponent.tsx
touch src/components/MyComponent.tsx
```

Always include:
- TypeScript interfaces for props
- Proper typing for all functions
- JSDoc comments for complex logic
- Tailwind CSS for styling (no CSS modules needed)

### 2. Adding a New Utility Function

```bash
# Add to src/lib/pdfUtils.ts or create new file
touch src/lib/newUtils.ts
```

Make sure to:
- Export functions for reusability
- Include proper TypeScript types
- Add JSDoc comments explaining usage
- Test thoroughly before committing

### 3. Modifying the PDF Parsing Logic

The core PDF parsing happens in `src/lib/pdfUtils.ts`:

- **`extractTableOfContents()`** - Parses PDF outline
- **`calculatePageRanges()`** - Computes page boundaries
- **`getSelectedItems()`** - Filters checked items

When modifying:
1. Test with various PDF types
2. Maintain backward compatibility
3. Update related type definitions
4. Document any breaking changes

## Testing

Currently, testing is manual. To test features:

1. Use sample PDFs with different outline structures:
   - PDF with deep hierarchy (3+ levels)
   - PDF without outline
   - PDF with special characters in chapter names
   - Large PDF (>100 pages)

2. Test in different browsers:
   - Chrome/Edge
   - Firefox
   - Safari

3. Test responsive design:
   - Desktop (1920px+)
   - Tablet (768px)
   - Mobile (375px)

## Common Tasks

### Debugging

```typescript
// Add console logs
console.log('Debug info:', value);

// Use debugger statement
debugger; // DevTools will pause here
```

### Adding New Dependencies

```bash
npm install package-name
npm install --save-dev package-name  # For dev dependencies
```

Update package.json and commit lockfile.

### Type Checking

Before committing, run:

```bash
npm run lint
```

## Deployment Readiness

Before deploying to production:

- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] No linting errors (`npm run lint`)
- [ ] `.env.local` is not committed
- [ ] `node_modules` is in `.gitignore`
- [ ] README is up to date

### Building for Production

```bash
npm run build    # Creates .next folder
npm start        # Serves production build
```

## Architecture Decisions

### Why pdf.js + pdf-lib?

- **pdf.js** - Best for reading/parsing PDFs and extracting text
- **pdf-lib** - Best for creating/manipulating PDFs
- Together they cover all use cases needed

### Why Client-Side Processing?

- Faster initial load (no server round-trip)
- User privacy (files never leave their browser)
- Reduced server costs
- Responsive UI with real-time feedback

### Why Not Server-Side?

- Would require Node.js PDF processing libraries
- More complex deployment
- Privacy concerns with file uploads
- Higher infrastructure costs

Future: Optional server-side processing for very large PDFs (>500MB).

## Learning Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [pdf.js Documentation](https://mozilla.github.io/pdf.js/)
- [pdf-lib Documentation](https://pdf-lib.js.org/)

## Troubleshooting Development

### Issue: Changes not reflecting

**Solution:** Clear Next.js cache:
```bash
rm -rf .next
npm run dev
```

### Issue: Module not found errors

**Solution:** Ensure import path uses `@/` alias:
```typescript
// ✅ Correct
import { foo } from '@/lib/utils';

// ❌ Incorrect
import { foo } from '../lib/utils';
```

### Issue: TypeScript errors in IDE

**Solution:** Restart TypeScript server in VS Code:
- `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
- Search "TypeScript: Restart TS Server"

### Issue: "npm is not recognized"

**Solution 1:** Add Node.js to PATH and restart PowerShell/Command Prompt

**Solution 2:** Use full path:
```powershell
"C:\Program Files\nodejs\npm" run dev
```

## Contributing Guidelines

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/my-feature`
3. **Commit** with clear messages: `git commit -m 'Add feature: my feature'`
4. **Push** to your branch: `git push origin feature/my-feature`
5. **Open** a Pull Request with description

Follow these in PRs:
- Clear description of changes
- Link related issues
- Test in multiple browsers
- Update documentation if needed

## Contact & Support

- For questions: Open a [GitHub Discussion](https://github.com/alicontarli/splitbychapter/discussions)
- For bugs: Open a [GitHub Issue](https://github.com/alicontarli/splitbychapter/issues)
- For security issues: Open a [private vulnerability report](https://github.com/alicontarli/splitbychapter/security/advisories)

---

**Happy Coding! 🚀**
