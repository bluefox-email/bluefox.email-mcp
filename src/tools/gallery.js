import { z } from 'zod'
import { textResult, ResolveError } from '../helpers/errors.js'

const extensionToContentType = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif'
}

function formatFolder (folder) {
  return `"${folder.name}" (id ${folder._id})${folder.parentFolderId ? '' : ' - top level'}`
}

function formatImage (image) {
  return `"${image.name}" (id ${image._id}) - ${image.url}`
}

function formatList (items, formatItem, count, label) {
  if (count === 0) {
    return `No ${label} here.`
  }
  const lines = items.map(formatItem).join('\n')
  return `${count} ${label}:\n${lines}${count > items.length ? '\n(more not shown)' : ''}`
}

function withGalleryHeader (text, list, atTopLevel) {
  if (atTopLevel && list.galleryName) {
    return `Project folder: "${list.galleryName}"\n${text}`
  }
  return text
}

export function createGalleryTools ({ client }) {
  return [
    {
      name: 'manage_gallery',
      config: {
        title: 'Manage the project\'s image gallery',
        description: 'Browses and manages this project\'s media gallery - a folder tree of images (logos, product photos, etc.) that can be used when building emails. This includes both the project\'s own folders and any account-wide shared folder (one usable from every project in the account, e.g. "Company Logos") - but never another project\'s own private folders. The top level of the gallery is this project\'s own space - it has no folder entry or id of its own, so there is nothing named after the project to open: you are always already inside it, and it can\'t be renamed or deleted here. Omit parentFolderId to operate at that top level; list_folders/list_images there prefix a "Project folder: <name>" line, and list_folders at the top level returns both the project\'s own top-level folders and any shared ones.',
        inputSchema: {
          action: z.enum(['list_folders', 'create_folder', 'rename_folder', 'delete_folder', 'list_images', 'upload_image', 'rename_image', 'delete_image']),
          parentFolderId: z.string().optional().describe('list_folders/list_images/create_folder/upload_image - the folder to operate within. Omit for the top level of the gallery. Get folder ids from list_folders.'),
          folderId: z.string().optional().describe('rename_folder/delete_folder, required - the folder to act on. Get it from list_folders.'),
          imageId: z.string().optional().describe('rename_image/delete_image, required - the image to act on. Get it from list_images.'),
          name: z.string().optional().describe('create_folder (required, new folder name) / rename_folder (required, new name) / rename_image (required, new name) / upload_image (optional, defaults to imageFileName).'),
          imageBase64: z.string().optional().describe('upload_image only, required - the image file content, base64-encoded.'),
          imageFileName: z.string().optional().describe('upload_image only, required - a filename ending in .jpg, .jpeg, .png, or .gif. Used to determine the content type, and as the default name if name is omitted.')
        }
      },
      handler: async (args) => {
        if (args.action === 'list_folders') {
          const list = await client.get('/gallery/folders', { parentFolderId: args.parentFolderId, limit: 30 })
          return textResult(withGalleryHeader(formatList(list.items, formatFolder, list.count, 'folder(s)'), list, !args.parentFolderId))
        }

        if (args.action === 'create_folder') {
          const result = await client.post('/gallery/folders', { name: args.name, parentFolderId: args.parentFolderId })
          return textResult(`Created folder ${formatFolder(result)}.`)
        }

        if (args.action === 'rename_folder') {
          if (!args.folderId) {
            throw new ResolveError('folderId is required.')
          }
          const result = await client.patch(`/gallery/folders/${args.folderId}`, { name: args.name })
          return textResult(`Renamed folder to ${formatFolder(result)}.`)
        }

        if (args.action === 'delete_folder') {
          if (!args.folderId) {
            throw new ResolveError('folderId is required.')
          }
          await client.del(`/gallery/folders/${args.folderId}`)
          return textResult('Deleted the folder, along with everything nested inside it.')
        }

        if (args.action === 'list_images') {
          const list = await client.get('/gallery/images', { parentFolderId: args.parentFolderId, limit: 30 })
          return textResult(withGalleryHeader(formatList(list.items, formatImage, list.count, 'image(s)'), list, !args.parentFolderId))
        }

        if (args.action === 'upload_image') {
          if (!args.imageBase64 || !args.imageFileName) {
            throw new ResolveError('Both imageBase64 and imageFileName are required.')
          }
          const extension = args.imageFileName.split('.').pop().toLowerCase()
          const contentType = extensionToContentType[extension]
          if (!contentType) {
            throw new ResolveError(`imageFileName must end in one of: ${Object.keys(extensionToContentType).map(ext => '.' + ext).join(', ')}.`)
          }
          const result = await client.postForm('/gallery/images', {
            fields: { name: args.name, parentFolderId: args.parentFolderId },
            file: { fieldName: 'image', buffer: Buffer.from(args.imageBase64, 'base64'), filename: args.imageFileName, contentType }
          })
          return textResult(`Uploaded image ${formatImage(result)}.`)
        }

        if (args.action === 'rename_image') {
          if (!args.imageId) {
            throw new ResolveError('imageId is required.')
          }
          const result = await client.patch(`/gallery/images/${args.imageId}`, { name: args.name })
          return textResult(`Renamed image to ${formatImage(result)}.`)
        }

        if (!args.imageId) {
          throw new ResolveError('imageId is required.')
        }
        await client.del(`/gallery/images/${args.imageId}`)
        return textResult('Deleted the image.')
      }
    }
  ]
}
