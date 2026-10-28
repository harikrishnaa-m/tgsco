import {
  createAddress,
  deleteAddress,
  getAddress,
  listAddresses,
  setDefaultAddress,
  updateAddress,
} from './address.service.js';
import { addressId, addressSchema, updateAddressSchema } from './address.validation.js';

export async function getAddresses(req, res) {
  res.json({ success: true, data: await listAddresses(req.user) });
}

export async function getAddressById(req, res) {
  res.json({ success: true, data: await getAddress(req.user, addressId.parse(req.params.id)) });
}

export async function create(req, res) {
  res
    .status(201)
    .json({ success: true, data: await createAddress(req.user, addressSchema.parse(req.body)) });
}

export async function update(req, res) {
  res.json({
    success: true,
    data: await updateAddress(
      req.user,
      addressId.parse(req.params.id),
      updateAddressSchema.parse(req.body),
    ),
  });
}

export async function setDefault(req, res) {
  res.json({
    success: true,
    data: await setDefaultAddress(req.user, addressId.parse(req.params.id)),
  });
}

export async function remove(req, res) {
  res.json({ success: true, data: await deleteAddress(req.user, addressId.parse(req.params.id)) });
}
