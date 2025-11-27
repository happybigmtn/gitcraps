import { test, expect } from '@playwright/test';

test('diagnose layout cutoff issue', async ({ page }) => {
  // Use a larger viewport to better detect issues
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2000);

  // Take full page screenshot
  await page.screenshot({ path: '/tmp/fullpage.png', fullPage: true });
  console.log('Full page screenshot saved to /tmp/fullpage.png');

  // Take viewport screenshot
  await page.screenshot({ path: '/tmp/viewport.png' });
  console.log('Viewport screenshot saved to /tmp/viewport.png');

  // Get page dimensions
  const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = await page.evaluate(() => window.innerHeight);

  console.log('Body height:', bodyHeight);
  console.log('Viewport height:', viewportHeight);

  // Check for viewport-based heights that might cause cutoff
  const vhElements = await page.evaluate(() => {
    const issues: any[] = [];
    document.querySelectorAll('*').forEach(el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      // Check for h-screen, min-h-screen, max-h-screen or vh-based heights
      const className = el.className?.toString() || '';
      const hasVhClass = /h-screen|min-h-screen|max-h-screen/.test(className);
      const hasVhStyle = style.height.includes('vh') || style.minHeight.includes('vh') || style.maxHeight.includes('vh');

      if ((hasVhClass || hasVhStyle) && rect.height > 50) {
        issues.push({
          tag: el.tagName,
          className: className.substring(0, 150),
          computedHeight: style.height,
          computedMinHeight: style.minHeight,
          computedMaxHeight: style.maxHeight,
          actualHeight: Math.round(rect.height),
          scrollHeight: el.scrollHeight,
          overflow: style.overflow,
          overflowY: style.overflowY,
        });
      }
    });
    return issues;
  });

  console.log('Elements with vh-based heights:', JSON.stringify(vhElements, null, 2));

  // Check if scrolling works
  const canScroll = await page.evaluate(() => {
    const scrollable = document.body.scrollHeight > window.innerHeight;
    return {
      bodyScrollHeight: document.body.scrollHeight,
      windowInnerHeight: window.innerHeight,
      canScroll: scrollable,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });

  console.log('Scroll info:', canScroll);

  // Scroll to bottom and take screenshot
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/scrolled-bottom.png' });
  console.log('Scrolled to bottom screenshot saved to /tmp/scrolled-bottom.png');

  // Check all direct children of body for overflow issues
  const bodyChildren = await page.evaluate(() => {
    const children: any[] = [];
    document.body.childNodes.forEach(node => {
      if (node.nodeType === 1) {
        const el = node as HTMLElement;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        children.push({
          tag: el.tagName,
          className: (el.className?.toString() || '').substring(0, 100),
          height: Math.round(rect.height),
          overflow: style.overflow,
          position: style.position,
        });
      }
    });
    return children;
  });

  console.log('Body children:', bodyChildren);
});
