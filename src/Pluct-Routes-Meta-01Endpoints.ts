// Metadata route handlers
// Following naming convention: [Project]-[ParentScope]-[ChildScope]-[SeparationOfConcern][CoreResponsibility]

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { Env } from './Pluct-Core-Interfaces-01Types';
import { buildInfo, log } from './Pluct-Core-Utilities-01Helpers';
import { createErrorResponse, handleMetaZodError } from './Pluct-Core-Utilities-02ErrorHandling';

// Zod schemas
const MetaQuerySchema = z.object({
  url: z.string().url()
});

const MetaResolveSchema = z.object({
  url: z.string().url()
});

export function setupMetaRoutes(app: Hono<{ Bindings: Env }>, metadataResolver: any) {
  // Get TikTok metadata with caching
  app.get('/meta', zValidator('query', MetaQuerySchema, (result, c) => {
    if (!result.success) {
      return handleMetaZodError(c, result.error);
    }
  }), async c => {
    try {
      const { url } = c.req.valid('query');
      
      // Validate TikTok URL
      if (!url.includes('tiktok.com') && !url.includes('vm.tiktok.com')) {
        const build = buildInfo(c.env);
        const errorResponse = createErrorResponse(
          'invalid_url',
          'Only TikTok URLs are supported',
          { providedUrl: url, supportedDomains: ['tiktok.com', 'vm.tiktok.com'] },
          build,
          'Please provide a valid TikTok URL'
        );
        return c.json(errorResponse, 422);
      }
      
      const metadata = await metadataResolver.fetchTikTokMetadata(url);
      
      return c.json({
        title: metadata.title || 'TikTok - Make Your Day',
        author: metadata.author || 'author',
        description: metadata.description || '',
        duration: metadata.duration || 118,
        handle: metadata.handle || 'media',
        url: url
      });
      
    } catch (error) {
      log('meta', 'metadata fetch failed', { error: (error as Error).message, url: c.req.valid('query')?.url });
      const build = buildInfo(c.env);
      const errorResponse = createErrorResponse(
        'METADATA_FETCH_FAILED',
        'Failed to fetch metadata',
        { error: (error as Error).message },
        build,
        'Please try again or contact support if the issue persists'
      );
      return c.json(errorResponse, 500);
    }
  });

  // Resolve TikTok metadata and start transcription
  app.post('/meta/resolve', zValidator('json', MetaResolveSchema), async c => {
    try {
      const { url } = await c.req.json();
      
      // Validate TikTok URL
      if (!url.includes('tiktok.com') && !url.includes('vm.tiktok.com')) {
        const build = buildInfo(c.env);
        const errorResponse = createErrorResponse(
          'invalid_url',
          'Only TikTok URLs are supported',
          { providedUrl: url, supportedDomains: ['tiktok.com', 'vm.tiktok.com'] },
          build,
          'Please provide a valid TikTok URL'
        );
        return c.json(errorResponse, 422);
      }
      
      const metadata = await metadataResolver.fetchTikTokMetadata(url);
      
      return c.json({
        meta: {
          title: metadata.title || 'TikTok - Make Your Day',
          author: metadata.author || 'author',
          description: metadata.description || '',
          duration: metadata.duration || 118,
          handle: metadata.handle || 'media',
          url: url
        },
        job: {
          id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          status: 'queued',
          submittedAt: new Date().toISOString()
        }
      });
      
    } catch (error) {
      log('meta_resolve', 'metadata resolution failed', { error: (error as Error).message });
      const build = buildInfo(c.env);
      const errorResponse = createErrorResponse(
        'METADATA_RESOLUTION_FAILED',
        'Failed to resolve metadata',
        { error: (error as Error).message },
        build,
        'Please try again or contact support if the issue persists'
      );
      return c.json(errorResponse, 500);
    }
  });
}
