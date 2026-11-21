# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
require 'csv'
require 'date'
require 'fileutils'

SourceField = Struct.new(:name)
SourceTable = Struct.new(:fields, :results_fields)

class ReadOnlyAsset
  def initialize(attributes, sampled = {})
    @attributes, @sampled = attributes, sampled
  end

  def [](name)
    @attributes.fetch(name)
  end

  def results(code)
    @sampled.fetch(code)
  end

  def table_info
    SourceTable.new(@attributes.keys.map { |name| SourceField.new(name) }, @sampled.keys.map { |name| SourceField.new(name) })
  end
end

class UiNetwork
  def initialize
    n1 = ReadOnlyAsset.new({ 'node_id' => '00127', 'node_type' => 'Manhole', 'x' => 100, 'y' => 80, 'ground_level' => 7.0, 'chamber_floor' => 4.2 },
                           { 'depnod' => [5.0, 5.2, nil], 'qnode' => [0, 0.1, 0.03], 'flooddepth' => [-1, 0, 0.2], 'floodvolume' => [0, 0, 3] })
    n2 = ReadOnlyAsset.new({ 'node_id' => '00129', 'node_type' => 'Outfall', 'x' => 123.0, 'y' => 95.0, 'ground_level' => 6.8, 'chamber_floor' => 4.1 },
                           { 'depnod' => [4.5, 5.3, 5.7], 'qnode' => [0, 0.035, 0.05], 'flooddepth' => [-2, -1, -1], 'floodvolume' => [0, 0, 0] })
    link = ReadOnlyAsset.new({ 'us_node_id' => '00127', 'ds_node_id' => '00129', 'link_suffix' => 'B', 'shape' => 'CIRC',
                              'conduit_length' => 27.0, 'conduit_width' => 500.0, 'conduit_height' => 500.0,
                              'us_invert' => 4.3, 'ds_invert' => 4.19, 'gradient' => 0.004, 'roughness_type' => 'CW',
                              'bottom_roughness_CW' => 1, 'top_roughness_CW' => 1, 'number_of_barrels' => 1, 'sediment_depth' => 0,
                              'point_array' => [100, 80, 110, 87, 123, 95] },
                             { 'us_flow' => [0, -0.125, nil], 'ds_flow' => [0, 0.030, 0.01], 'us_depth' => [0, 0.1, 0.3],
                               'ds_depth' => [0, 0.2, 0.3], 'us_vel' => [0, -0.2, nil], 'ds_vel' => [0, 0.5, 0.5] })
    weir = ReadOnlyAsset.new({ 'us_node_id' => '00127', 'ds_node_id' => '00129', 'link_suffix' => 'W', 'point_array' => [] },
                             { 'us_flow' => [0, 0, 0.06], 'ds_flow' => [0, 0, 0.06] })
    catchment = ReadOnlyAsset.new({ 'subcatchment_id' => '0001', 'system_type' => 'Combined', 'population' => 100, 'base_flow' => nil,
                                    'connectivity' => 90, 'node_id' => '00127', 'trade_flow' => 0.01, 'additional_foul_flow' => 0 })
    @tables = { 'hw_node' => [n1], 'hw_conduit' => [link], 'hw_weir' => [weir], 'hw_subcatchment' => [catchment] }
    @nodes = { '00127' => n1, '00129' => n2 }
  end

  def row_objects_selection(table)
    @tables.fetch(table, [])
  end

  def row_object_collection(table)
    table == 'hw_node' ? @nodes.values : row_objects_selection(table)
  end

  def row_object(table, id)
    raise 'Unexpected lookup' unless table == 'hw_node'
    @nodes.fetch(id)
  end

  def list_timesteps
    [0, 420, 900]
  end
end

module WSApplication
  def self.current_network
    @network ||= UiNetwork.new
  end

  def self.prompt(_title, fields, _readonly)
    root = File.realpath(ARGV.fetch(1))
    state = [root, 'selected', true, 'SYNTHETIC-REV', 'Baseline']
    return state if fields.size == 5
    state + ['SYNTHETIC-SIM', 'Design event', 'ODN', 'elapsed-seconds', '2025-01-01 00:00:00', '', '']
  end
end

download = ARGV.fetch(0)
root = ARGV.fetch(1)
FileUtils.mkdir_p(root)
%w[network-geometry simulation-series formula-a-catchments spill-storage-continuation monitoring-results detriment-results].each do |job|
  source = Dir.glob(File.join(download, job + '-v*.rb')).first
  raise "No standalone file for #{job}" unless source
  load source
end

folders = Dir.glob(File.join(root, 'hydra_*')).sort
raise 'All six jobs must complete' unless folders.size == 6
folders.each { |folder| raise 'Missing completion record' unless File.file?(File.join(folder, 'hydra_export_complete.csv')) }
raise 'Unsafe project-clock date accepted' if begin
  HydraIcmExport.parse_project_clock('2025-02-30 00:00:00'); true
rescue ArgumentError
  false
end
raise 'Unsafe text accepted' if begin
  HydraIcmExport.csv_value(' =1+2'); true
rescue ArgumentError
  false
end
raise 'Signed flow changed' unless HydraIcmExport.csv_value(-0.125) == -0.125
puts 'ICM_TOOLKIT_READ_ONLY_MOCK_PASS'
