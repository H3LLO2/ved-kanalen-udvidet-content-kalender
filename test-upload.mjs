import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const IMAGE_FOLDER = 'C:\\Users\\koert\\Desktop\\Foto VED KANALEN\\jpg';
const APP_URL = 'http://localhost:3001';

async function main() {
  console.log('🚀 Starting Puppeteer test...');

  // Get all image files
  const files = fs.readdirSync(IMAGE_FOLDER)
    .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .map(f => path.join(IMAGE_FOLDER, f));

  console.log(`📸 Found ${files.length} images to upload`);

  const browser = await puppeteer.launch({
    headless: false, // Show browser for monitoring
    defaultViewport: { width: 1400, height: 900 },
    args: ['--start-maximized']
  });

  const page = await browser.newPage();

  // Listen for console logs from the page
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error') {
      console.log(`❌ PAGE ERROR: ${msg.text()}`);
    }
  });

  // Navigate to app
  console.log(`🌐 Opening ${APP_URL}...`);
  try {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('✅ Page loaded');
  } catch (err) {
    console.log('⚠️ Initial load slow, waiting more...');
    await new Promise(r => setTimeout(r, 5000));
  }

  // Wait for the app to initialize
  await new Promise(r => setTimeout(r, 2000));

  // Check if we need to create a campaign first
  const needsCampaign = await page.evaluate(() => {
    return document.body.innerText.includes('Opret ny kampagne') ||
           document.body.innerText.includes('Vælg eller opret');
  });

  if (needsCampaign) {
    console.log('📁 Creating new campaign...');

    // Check if there's an existing campaign to select
    const existingCampaign = await page.$('button:has(svg.lucide-folder-open)');
    if (existingCampaign) {
      console.log('📂 Found existing campaign, selecting it...');
      await existingCampaign.click();
    } else {
      // Click "Opret ny kampagne" button
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const createBtn = buttons.find(b => b.textContent.includes('Opret ny kampagne'));
        if (createBtn) createBtn.click();
      });

      await new Promise(r => setTimeout(r, 1000));

      // Fill in campaign name (it should have default value)
      // Click "Opret kampagne" button
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const submitBtn = buttons.find(b => b.textContent.trim() === 'Opret kampagne');
        if (submitBtn) submitBtn.click();
      });

      console.log('✅ Campaign created');
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  // Now wait for the file input in ContentWorkflow
  console.log('⏳ Waiting for upload area...');
  await page.waitForSelector('input[type="file"]', { timeout: 30000 });
  console.log('✅ File input found');

  // Upload all images at once
  console.log(`📤 Uploading ${files.length} images...`);
  const fileInput = await page.$('input[type="file"]');
  await fileInput.uploadFile(...files);

  // Wait for images to be processed
  console.log('⏳ Waiting for images to process...');
  await new Promise(r => setTimeout(r, 5000)); // Give some time for processing

  // Wait for images to appear in the grid
  let imageCount = 0;
  for (let i = 0; i < 60; i++) { // Wait up to 60 seconds
    await new Promise(r => setTimeout(r, 1000));
    imageCount = await page.evaluate(() => {
      return document.querySelectorAll('img[src^="blob:"]').length;
    });
    console.log(`📊 Images loaded: ${imageCount}/${files.length}`);
    if (imageCount >= files.length) break;
  }

  console.log(`✅ ${imageCount} images uploaded and displayed`);

  // Wait a moment for UI to stabilize
  await new Promise(r => setTimeout(r, 2000));

  // Open settings panel
  console.log('⚙️ Opening settings...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const settingsBtn = buttons.find(b => b.textContent.includes('Indstillinger'));
    if (settingsBtn) settingsBtn.click();
  });

  await new Promise(r => setTimeout(r, 1000));

  // Select Batch 1 (should be default)
  const selects = await page.$$('select');
  if (selects.length > 0) {
    await selects[0].select('1');
    console.log('✅ Batch 1 selected (8 days: Jan 20-27)');
  }

  await new Promise(r => setTimeout(r, 500));

  // Click "Generer content" button
  console.log('🎯 Looking for generate button...');
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const genBtn = buttons.find(b =>
      b.textContent.includes('Generer content') ||
      b.textContent.includes('Fortsæt med')
    );
    if (genBtn) {
      genBtn.click();
      return true;
    }
    return false;
  });

  if (clicked) {
    console.log('🚀 Generation started!');
  } else {
    console.log('❌ Could not find generate button');
    // Take a screenshot to debug
    await page.screenshot({ path: 'debug-screenshot.png' });
    console.log('📷 Screenshot saved to debug-screenshot.png');
  }

  // Monitor progress
  console.log('📊 Monitoring progress...');
  let lastMessage = '';
  let completedCount = 0;

  while (completedCount < 120) { // Wait up to 2 minutes after no change
    await new Promise(r => setTimeout(r, 1000));

    const status = await page.evaluate(() => {
      const body = document.body.innerText;
      const postsCount = document.querySelectorAll('textarea').length;
      const isComplete = body.includes('Alle opslag er genereret') || body.includes('Output');
      const stage = body.match(/Analyserer|Opretter|Genererer|Skriver/)?.[0] || '';
      const progress = body.match(/(\d+) af (\d+)/)?.[0] || '';

      return {
        posts: postsCount,
        stage,
        progress,
        isComplete,
        hasError: body.includes('fejl') || body.includes('Error')
      };
    });

    const currentMessage = `Stage: ${status.stage || 'waiting'} | Progress: ${status.progress || '-'} | Posts: ${status.posts}`;

    if (currentMessage !== lastMessage) {
      console.log(`📊 ${currentMessage}`);
      lastMessage = currentMessage;
      completedCount = 0;
    } else {
      completedCount++;
    }

    if (status.hasError) {
      console.log('⚠️ Error detected!');
      await page.screenshot({ path: 'error-screenshot.png' });
    }

    // Check if generation is complete
    if (status.isComplete && status.posts > 0) {
      console.log(`\n✅ Generation complete! ${status.posts} posts created.`);
      break;
    }
  }

  // Get final results
  const captions = await page.evaluate(() => {
    const textareas = document.querySelectorAll('textarea');
    return Array.from(textareas).map((ta, i) => ({
      day: i + 1,
      caption: ta.value || ta.textContent || ''
    }));
  });

  console.log('\n' + '='.repeat(60));
  console.log('📋 GENERATED CAPTIONS:');
  console.log('='.repeat(60));

  captions.forEach(c => {
    console.log(`\n--- DAY ${c.day} ---`);
    console.log(c.caption.substring(0, 300) + (c.caption.length > 300 ? '...' : ''));
  });

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Test complete! Generated ${captions.length} captions.`);
  console.log('Browser will stay open for inspection. Press Ctrl+C to close.');

  // Keep browser open for inspection
  await new Promise(() => {});
}

main().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
