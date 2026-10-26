import { AppError } from '../../errors/app-error.js';
import { Address } from '../../models/address.model.js';

async function unsetDefault(userId, exceptId) {
  const filter = { user: userId, isDefault: true };
  if (exceptId) filter._id = { $ne: exceptId };
  await Address.updateMany(filter, { $set: { isDefault: false } });
}

function sortAddresses(addresses) {
  return addresses.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

export async function listAddresses(user) {
  return sortAddresses(await Address.find({ user: user.sub }).sort({ createdAt: -1 }).lean());
}

export async function getAddress(user, addressId) {
  const address = await Address.findOne({ _id: addressId, user: user.sub }).lean();
  if (!address) {
    throw new AppError('The address was not found.', { statusCode: 404, code: 'ADDRESS_NOT_FOUND' });
  }
  return address;
}

export async function createAddress(user, input) {
  const hasAddresses = await Address.exists({ user: user.sub });
  const isDefault = input.isDefault || !hasAddresses;
  if (isDefault) await unsetDefault(user.sub);
  return Address.create({ ...input, user: user.sub, isDefault });
}

export async function updateAddress(user, addressId, input) {
  const address = await Address.findOne({ _id: addressId, user: user.sub });
  if (!address) {
    throw new AppError('The address was not found.', { statusCode: 404, code: 'ADDRESS_NOT_FOUND' });
  }
  if (input.isDefault) await unsetDefault(user.sub, address._id);
  Object.assign(address, input);
  await address.save();
  return address;
}

export async function setDefaultAddress(user, addressId) {
  const address = await Address.findOne({ _id: addressId, user: user.sub });
  if (!address) {
    throw new AppError('The address was not found.', { statusCode: 404, code: 'ADDRESS_NOT_FOUND' });
  }
  await unsetDefault(user.sub, address._id);
  address.isDefault = true;
  await address.save();
  return address;
}

export async function deleteAddress(user, addressId) {
  const address = await Address.findOneAndDelete({ _id: addressId, user: user.sub });
  if (!address) {
    throw new AppError('The address was not found.', { statusCode: 404, code: 'ADDRESS_NOT_FOUND' });
  }
  if (address.isDefault) {
    const replacement = await Address.findOne({ user: user.sub }).sort({ createdAt: -1 });
    if (replacement) {
      replacement.isDefault = true;
      await replacement.save();
    }
  }
  return { deleted: true, addressId };
}
