import fs from 'fs/promises'
import path from 'path'
import { z } from 'zod'
import { textResult, ResolveError } from '../helpers/errors.js'

const extensionToContentType = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif'
}

const contentTypeToExtension = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif'
}

const allowedExtensionsNote = Object.keys(extensionToContentType).map(ext => '.' + ext).join(', ')

function contentTypeFromName (name) {
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
  return extensionToContentType[ext]
}

// Turns whichever of imageUrl / imagePath / imageBase64 was given into the raw bytes to upload,
// so the caller never has to download or base64-encode an image itself.
async function resolveUploadFile (args) {
  const sources = ['imageUrl', 'imagePath', 'imageBase64'].filter(key => args[key])
  if (sources.length !== 1) {
    throw new ResolveError('Provide exactly one of imageUrl, imagePath, or imageBase64.')
  }

  if (args.imageUrl) {
    let res
    try {
      res = await fetch(args.imageUrl)
    } catch (err) {
      throw new ResolveError(`Could not fetch imageUrl: ${err.message}`)
    }
    if (!res.ok) {
      throw new ResolveError(`Could not fetch imageUrl: the server responded ${res.status}.`)
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    const urlPath = new URL(args.imageUrl).pathname
    const headerType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    const contentType = contentTypeFromName(urlPath) || (contentTypeToExtension[headerType] ? headerType : undefined)
    if (!contentType) {
      throw new ResolveError(`Could not tell the image type from imageUrl - it must be a ${allowedExtensionsNote} image.`)
    }
    const filename = path.basename(urlPath) || `image.${contentTypeToExtension[contentType]}`
    return { buffer, filename, contentType }
  }

  if (args.imagePath) {
    const contentType = contentTypeFromName(args.imagePath)
    if (!contentType) {
      throw new ResolveError(`imagePath must end in ${allowedExtensionsNote}.`)
    }
    let buffer
    try {
      buffer = await fs.readFile(args.imagePath)
    } catch (err) {
      throw new ResolveError(`Could not read imagePath: ${err.message}`)
    }
    return { buffer, filename: path.basename(args.imagePath), contentType }
  }

  if (!args.imageFileName) {
    throw new ResolveError('imageFileName is required when uploading with imageBase64.')
  }
  const contentType = contentTypeFromName(args.imageFileName)
  if (!contentType) {
    throw new ResolveError(`imageFileName must end in ${allowedExtensionsNote}.`)
  }
  return { buffer: Buffer.from(args.imageBase64, 'base64'), filename: args.imageFileName, contentType }
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

// The top level of the gallery IS the project's own folder, which the API never returns as an item
// (it has no usable id - you reach it by omitting parentFolderId). List it explicitly so it shows up
// alongside the folders sitting inside it.
function formatTopLevelFolders (list) {
  const projectRow = `"${list.galleryName}" - the project folder itself, i.e. this top level (target it by omitting parentFolderId; it can't be renamed or deleted)`
  const lines = [projectRow, ...list.items.map(formatFolder)].join('\n')
  const more = list.count > list.items.length ? '\n(more not shown)' : ''
  return `${list.count + 1} folder(s):\n${lines}${more}`
}

export function createGalleryTools ({ client }) {
  return [
    {
      name: 'manage_gallery',
      config: {
        title: 'Manage the project\'s image gallery',
        description: 'Browses and manages this project\'s media gallery - a folder tree of images (logos, product photos, etc.) that can be used when building emails. This includes both the project\'s own folders and any account-wide shared folder (one usable from every project in the account, e.g. "Company Logos") - but never another project\'s own private folders. The top level of the gallery is this project\'s own space - it has no folder entry or id of its own, so there is nothing named after the project to open: you are always already inside it, and it can\'t be renamed or deleted here. Omit parentFolderId to operate at that top level. list_folders at the top level lists the project folder itself as the first entry (no id - reach it by omitting parentFolderId), followed by the project\'s own top-level folders and any shared ones; list_images at the top level prefixes a "Project folder: <name>" line. To add an image, pass upload_image a web link (imageUrl) or a local file path (imagePath) directly - the server fetches the bytes itself, so you never need to download or base64-encode anything.',
        inputSchema: {
          action: z.enum(['list_folders', 'create_folder', 'rename_folder', 'delete_folder', 'list_images', 'upload_image', 'rename_image', 'delete_image']),
          parentFolderId: z.string().optional().describe('list_folders/list_images/create_folder/upload_image - the folder to operate within. Omit for the top level of the gallery. Get folder ids from list_folders.'),
          folderId: z.string().optional().describe('rename_folder/delete_folder, required - the folder to act on. Get it from list_folders.'),
          imageId: z.string().optional().describe('rename_image/delete_image, required - the image to act on. Get it from list_images.'),
          name: z.string().optional().describe('create_folder (required, new folder name) / rename_folder (required, new name) / rename_image (required, new name) / upload_image (optional gallery display name, defaults to the file name).'),
          imageUrl: z.string().optional().describe('upload_image - an http(s) URL to fetch the image from. Use this for an image that is already on the web: pass the link directly, do not download or encode it yourself.'),
          imagePath: z.string().optional().describe('upload_image - a path to an image file on this machine. Use this for a local file: pass the path directly, do not read or encode it yourself.'),
          imageBase64: z.string().optional().describe('upload_image fallback - the raw image bytes, base64-encoded. Only use this when there is no URL or local path, e.g. an image pasted straight into the chat. Requires imageFileName.'),
          imageFileName: z.string().optional().describe('upload_image - required only with imageBase64: a filename ending in .jpg, .jpeg, .png, or .gif, used to determine the image type.')
        }
      },
      handler: async (args) => {
        if (args.action === 'list_folders') {
          const list = await client.get('/gallery/folders', { parentFolderId: args.parentFolderId, limit: 30 })
          if (!args.parentFolderId && list.galleryName) {
            return textResult(formatTopLevelFolders(list))
          }
          return textResult(formatList(list.items, formatFolder, list.count, 'folder(s)'))
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
          const file = await resolveUploadFile(args)
          const result = await client.postForm('/gallery/images', {
            fields: { name: args.name, parentFolderId: args.parentFolderId },
            file: { fieldName: 'image', ...file }
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
