import type { FrontMatter} from 'sentry-docs/mdx';
import { Platform, PlatformGuide } from './types';

export interface DocNode {
  path: string;
  slug: string;
  frontmatter: FrontMatter;
  parent?: DocNode;
  children: DocNode[];
  missing: boolean;
};

function slugWithoutIndex(slug: string): string[] {
  const parts = slug.split('/');
  if (parts[parts.length - 1] === 'index') {
    parts.pop();
  }
  return parts;
}

export function frontmatterToTree(frontmatter: FrontMatter[]): DocNode | undefined {
  if (frontmatter.length === 0) {
    return;
  }

  const sortedDocs = frontmatter.sort((a, b) => {
    const partDiff = slugWithoutIndex(a.slug).length - slugWithoutIndex(b.slug).length;
    if (partDiff !== 0) {
      return partDiff;
    }
    const orderDiff = (a.sidebar_order || 99999) - (b.sidebar_order || 99999);
    if (orderDiff !== 0) {
      return orderDiff;
    }
    return (a.title || '').localeCompare(b.title || '');
  });
  
  const rootNode: DocNode = {
    path: '/',
    slug: '',
    frontmatter: {
      title: 'Home',
    },
    children: [],
    missing: false,
  }

  const slugMap = {};
  sortedDocs.forEach((doc) => {
    const slugParts = slugWithoutIndex(doc.slug);
    const slug = slugParts.join('/');
    
    if (slugParts.length === 0) {
      rootNode.frontmatter = doc;
    } else if (slugParts.length === 1) {
      const node = {
        path: slug,
        slug: slug,
        frontmatter: doc,
        parent: rootNode,
        children: [],
        missing: false,
      };
      rootNode.children.push(node);
      slugMap[slug] = node;
    } else {
      const parentSlug = slugParts.slice(0, slugParts.length - 1).join('/');
      let parent = slugMap[parentSlug];
      if (!parent) {
        const grandparentSlug = slugParts.slice(0, slugParts.length - 2).join('/');
        const grandparent = slugMap[grandparentSlug];
        if (!grandparent) {
          throw new Error('missing parent and grandparent: ' + parentSlug);
        }
        parent = {
          path: parentSlug,
          slug: slugParts[slugParts.length - 2],
          frontmatter: {},
          parent: grandparent,
          children: [],
          missing: true,
        }
        grandparent.children.push(parent);
        slugMap[parentSlug] = parent;
      }
      const node = {
        path: slug,
        slug: slugParts[slugParts.length - 1],
        frontmatter: doc,
        parent: parent,
        children: [],
        missing: false,
      };
      parent.children.push(node);
      slugMap[slug] = node;
    }
  }); 
  
  return rootNode;
}

export function nodeForPath(node: DocNode, path: string | string[]): DocNode | undefined {
  const stringPath = (typeof path === 'string') ? path : path.join('/');
  const parts = slugWithoutIndex(stringPath);
  for (let i = 0; i < parts.length; i++) {
    const maybeChild = node.children.find((child) => child.slug === parts[i])
    if (maybeChild) {
      node = maybeChild
    } else {
      console.warn('no child found for', parts[i]);
      return;
    }
  }
  return node;
}

function nodeToPlatform(n: DocNode): Platform {
  return {
    guides: extractGuides(n),
    key: n.slug,
    name: n.slug,
    type: 'platform',
    url: '/' + n.path,
    title: n.frontmatter.title,
  };
}

export function getPlatform(rootNode: DocNode, name: string): Platform | undefined {
  const platformNode = nodeForPath(rootNode, ['platforms', name]);
  if (!platformNode) {
    return;
  }
  return nodeToPlatform(platformNode);
}

export function extractPlatforms(rootNode: DocNode): Platform[] {
  const platformsNode = nodeForPath(rootNode, 'platforms');
  if (!platformsNode) {
    return [];
  }
  
  return platformsNode.children.map(nodeToPlatform);
}

function extractGuides(platformNode: DocNode): PlatformGuide[] {
  // TODO
  return [];
}