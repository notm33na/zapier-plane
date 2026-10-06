'use strict';

const authentication = require('./authentication');
const { addApiKey, handlePlaneErrors } = require('./lib/errors');

const projectList = require('./triggers/project_list');
const stateList = require('./triggers/state_list');
const labelList = require('./triggers/label_list');
const newWorkItem = require('./triggers/new_work_item');
const createWorkItem = require('./creates/create_work_item');
const findWorkItem = require('./searches/find_work_item');

module.exports = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,

  flags: { cleanInputData: false },

  authentication,

  beforeRequest: [addApiKey],
  afterResponse: [handlePlaneErrors],

  triggers: {
    [projectList.key]: projectList,
    [stateList.key]: stateList,
    [labelList.key]: labelList,
    [newWorkItem.key]: newWorkItem,
  },

  searches: {
    [findWorkItem.key]: findWorkItem,
  },
  creates: {
    [createWorkItem.key]: createWorkItem,
  },

  // Search key must equal the searchOrCreate key (ARCHITECTURE §6, D9).
  searchOrCreates: {
    [findWorkItem.key]: {
      key: findWorkItem.key,
      display: {
        label: 'Find or Create Work Item',
        description: 'Finds a work item by title, or creates it if none exists.',
      },
      search: findWorkItem.key,
      create: createWorkItem.key,
    },
  },

  resources: {},
};
