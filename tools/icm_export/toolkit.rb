# SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
# SPDX-License-Identifier: AGPL-3.0-only
# Hydra Bench local ICM export toolkit. The release builder appends the selected job.

require 'csv'
require 'date'

module HydraIcmExport
  VERSION = '1.0.0'.freeze
  GEOMETRY = {
    'hw_node' => %w[node_id node_type x y ground_level chamber_floor],
    'hw_conduit' => %w[us_node_id ds_node_id link_suffix shape conduit_length conduit_width conduit_height
                       us_invert ds_invert gradient roughness_type bottom_roughness_CW top_roughness_CW
                       number_of_barrels sediment_depth point_array]
  }.freeze
  LINK_TYPES = %w[hw_conduit hw_pump hw_weir hw_orifice hw_sluice hw_flap_valve hw_screen hw_user_control hw_outlet].freeze
  LINK_COLUMNS = %w[us_node_id ds_node_id link_suffix point_array].freeze
  CATCHMENTS = %w[subcatchment_id system_type population contributing_area land_use_id wastewater_profile
                  drains_to node_id link_suffix ground_node connectivity trade_flow trade_profile base_flow additional_foul_flow].freeze
  RESULT_PROFILES = {
    :simulation => { 'hw_node' => { 'depnod' => 'm' },
                     'hw_conduit' => { 'us_flow' => 'm³/s', 'ds_flow' => 'm³/s', 'us_depth' => 'm', 'ds_depth' => 'm' } },
    :spill_storage => { 'hw_node' => { 'depnod' => 'm', 'volume' => 'm³' }, 'hw_conduit' => { 'us_flow' => 'm³/s', 'ds_flow' => 'm³/s' },
                        'hw_weir' => { 'us_flow' => 'm³/s', 'ds_flow' => 'm³/s' },
                        'hw_orifice' => { 'us_flow' => 'm³/s', 'ds_flow' => 'm³/s' } },
    :monitoring => { 'hw_node' => { 'depnod' => 'm', 'qnode' => 'm³/s' },
                     'hw_conduit' => { 'us_flow' => 'm³/s', 'ds_flow' => 'm³/s', 'us_depth' => 'm', 'ds_depth' => 'm',
                                       'us_vel' => 'm/s', 'ds_vel' => 'm/s' } },
    :detriment => { 'hw_node' => { 'depnod' => 'm', 'flooddepth' => 'm', 'floodvolume' => 'm³' },
                    'hw_weir' => { 'us_flow' => 'm³/s', 'ds_flow' => 'm³/s' },
                    'hw_orifice' => { 'us_flow' => 'm³/s', 'ds_flow' => 'm³/s' } }
  }.freeze
  UNIT_LABELS = {
    'x' => 'm', 'y' => 'm', 'ground_level' => 'm', 'chamber_floor' => 'm', 'conduit_length' => 'm',
    'conduit_width' => 'mm', 'conduit_height' => 'mm', 'us_invert' => 'm', 'ds_invert' => 'm', 'point_array' => 'm',
    'bottom_roughness_cw' => 'mm', 'top_roughness_cw' => 'mm', 'sediment_depth' => 'mm'
  }.freeze
  MAX_RESULTS_PER_ATTRIBUTE = 5_000_000
  SAFE_CODE = /\A[a-zA-Z][a-zA-Z0-9_]{0,63}\z/
  CLOCK = /\A\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d{1,3})?\z/

  def self.required_text(value, name)
    text = value.to_s.strip
    raise ArgumentError, "Enter #{name}." if text.empty? || text.length > 256 || text.match?(/[[:cntrl:]]/)
    text
  end

  def self.csv_value(value)
    case value
    when nil, true, false then value
    when Numeric
      raise ArgumentError, 'A numeric result is non-finite.' unless value.finite?
      value
    when String
      if value.match?(/\A[[:space:][:cntrl:]]*[=+\-@]/) || value.include?("\0")
        raise ArgumentError, 'A source text value is unsafe in a spreadsheet. Review the source or use the native export as an engineering data file.'
      end
      value
    else
      raise ArgumentError, 'A selected field uses an unsupported nested type. Use native ICM export with field descriptions.'
    end
  end

  def self.geometry_value(row, field)
    value = row[field]
    return csv_value(value) unless field == 'point_array' && value.is_a?(Array)
    return nil if value.empty?
    raise ArgumentError, 'The link vertex array is malformed.' if value.size < 4 || value.size.odd?
    raise ArgumentError, 'The link vertex array is nonnumeric.' unless value.all? { |coordinate| coordinate.is_a?(Numeric) && coordinate.finite? }
    '{' + value.join(',') + '}'
  end

  def self.table_rows(net, tab, scope)
    return net.row_object_collection(tab).to_a if scope == 'all'
    net.row_objects_selection(tab)
  end

  def self.fields_for(row, method)
    fields = method == :results_fields ? row.table_info.results_fields : row.table_info.fields
    (fields || []).each_with_object({}) { |field, fields_by_name| fields_by_name[field.name.downcase] = field.name }
  end

  def self.write_csv(folder, name)
    path = File.join(folder, name)
    File.open(path, File::WRONLY | File::CREAT | File::EXCL, 0o600) do |out|
      csv = CSV.new(out)
      yield csv
    end
    path
  end

  def self.add_table(csv, table, rows, wanted, required, unit_labels)
    available = fields_for(rows.first, :fields)
    missing = required.reject { |term| available.key?(term.downcase) }
    raise ArgumentError, "#{table} is missing required fields: #{missing.join(', ')}." unless missing.empty?
    headers = wanted.map { |name| available[name.downcase] }.compact.uniq
    omitted = wanted.reject { |name| available.key?(name.downcase) }
    puts "#{table}: omitted unavailable fields #{omitted.join(', ')}" unless omitted.empty?
    csv << ["**** #{table}"]
    tagged = !unit_labels.empty?
    csv << (tagged ? ['objecttable'] + headers : headers)
    csv << ['UserUnits'] + headers.map { |key| unit_labels[key.downcase] } if tagged
    rows.each do |row|
      values = headers.map { |name| geometry_value(row, name) }
      csv << (tagged ? [table] + values : values)
    end
    puts "#{table}: #{rows.size} rows"
  end

  def self.geometry(net, folder, scope, options)
    links = options.fetch(:link_tables, LINK_TYPES)
    raise ArgumentError, 'Choose supported network link tables.' unless (links - LINK_TYPES).empty? && links.uniq == links
    tables = links.map { |table| [table, table_rows(net, table, scope)] }.reject { |_, rows| rows.empty? }
    nodes = table_rows(net, 'hw_node', scope).each_with_object({}) { |row, map| map[row['node_id']] = row }
    tables.each do |_, rows|
      rows.each do |link|
        %w[us_node_id ds_node_id].each do |field|
          id = link[field]
          next if nodes.key?(id)
          nodes[id] = net.row_object('hw_node', id)
          raise ArgumentError, 'A selected link endpoint is absent from the active model.' unless nodes[id]
        end
      end
    end
    raise ArgumentError, 'Select nodes or links in the active InfoWorks GeoPlan.' if nodes.empty?
    extra = options.fetch(:extra_fields, {})
    write_csv(folder, 'network_geometry.csv') do |csv|
      add_table(csv, 'hw_node', nodes.values, GEOMETRY['hw_node'] + extra.fetch('hw_node', []), %w[node_id x y], UNIT_LABELS)
      tables.each do |table, rows|
        add_table(csv, table, rows, GEOMETRY.fetch(table, LINK_COLUMNS) + extra.fetch(table, []), LINK_COLUMNS.first(3), UNIT_LABELS)
      end
    end
  end

  def self.catchments(net, folder, scope, options)
    rows = table_rows(net, 'hw_subcatchment', scope)
    raise ArgumentError, 'Select the reviewed contributing subcatchments in the active GeoPlan.' if rows.empty?
    write_csv(folder, 'formula_a_catchments.csv') do |csv|
      add_table(csv, 'hw_subcatchment', rows, CATCHMENTS + options.fetch(:extra_fields, {}).fetch('hw_subcatchment', []),
                %w[subcatchment_id], {})
    end
  end

  def self.clock_format(stamp)
    rounded = stamp.strftime('%Y-%m-%d %H:%M:%S.%L')
    raise ArgumentError, 'Unsupported ICM result timestamp.' unless rounded.match?(CLOCK)
    rounded
  end

  def self.parse_project_clock(input)
    raise ArgumentError, 'Use a confirmed project time in YYYY-MM-DD HH:mm:ss format.' unless input.to_s.match?(CLOCK)
    DateTime.iso8601(input.tr(' ', 'T'))
  rescue Date::Error
    raise ArgumentError, 'The project time has an invalid calendar date or clock value.'
  end

  def self.clock_values(samples, mode, origin)
    raise ArgumentError, 'Open a completed simulation replay before exporting result samples.' if samples.nil? || samples.empty?
    case mode
    when 'calendar'
      raise ArgumentError, 'Select the numeric clock basis explicitly for this simulation.' unless samples.all? { |value| value.is_a?(DateTime) || value.is_a?(Time) }
      times = samples.map { |sample| clock_format(sample) }
    when 'elapsed-seconds', 'unix-seconds'
      raise ArgumentError, 'The chosen numeric clock requires finite numeric samples.' unless samples.all? { |value| value.is_a?(Numeric) && value.finite? }
      if mode == 'elapsed-seconds'
        reference = parse_project_clock(origin).to_time.utc.to_r
      else
        reference = 0
      end
      times = samples.map { |sample| clock_format(Time.at(reference + sample).utc) }
    else
      raise ArgumentError, 'Choose calendar, elapsed-seconds or unix-seconds.'
    end
    raise ArgumentError, 'Export clock requires strictly increasing timesteps at millisecond precision.' unless times.each_cons(2).all? { |a, b| a < b }
    times
  end

  def self.result_columns(rows, table)
    ids = rows.map do |row|
      table == 'hw_node' ? required_text(row['node_id'], 'the node ID') :
        required_text(row['us_node_id'], 'the upstream node ID') + '.' + required_text(row['link_suffix'], 'the link suffix')
    end
    raise ArgumentError, "Duplicate #{table} result object IDs." unless ids.map(&:upcase).uniq.size == ids.size
    ids.map { |id| csv_value(id) }
  end

  def self.write_results(net, folder, job, scope, options, details)
    mode, origin, from, to = details.values_at(:clock, :origin, :from, :to)
    times = clock_values(net.list_timesteps, mode, origin)
    first = from.empty? ? 0 : times.index(clock_format(parse_project_clock(from)))
    last = to.empty? ? times.size - 1 : times.index(clock_format(parse_project_clock(to)))
    raise ArgumentError, 'The export start and end must match actual simulation samples in order.' unless first && last && first <= last
    definitions = options.fetch(:result_fields, RESULT_PROFILES.fetch(job))
    completed = []
    definitions.each do |table, fields|
      raise ArgumentError, 'Choose a supported result table.' unless table == 'hw_node' || LINK_TYPES.include?(table)
      rows = table_rows(net, table, scope)
      next if rows.empty?
      raise ArgumentError, 'Use a smaller object selection or export the native result CSV.' if rows.size * times.size > MAX_RESULTS_PER_ATTRIBUTE
      ids = result_columns(rows, table)
      available = fields_for(rows.first, :results_fields)
      fields.each do |code, unit|
        raise ArgumentError, 'Use documented result attribute names and explicit units.' unless code.match?(SAFE_CODE) && !unit.to_s.empty?
        actual = available[code.downcase]
        unless actual
          puts "#{table} / #{code}: unavailable in this result table"
          next
        end
        name = table + '_' + code.downcase + '.csv'
        puts "#{name}: #{ids.size} assets × #{last - first + 1} samples; estimated under #{(ids.size * (last - first + 1) * 32 / 1024.0).ceil} KiB of values"
        data = rows.map { |row| row.results(actual) }
        unless data.all? { |column| column.nil? || (column.is_a?(Array) && column.size == times.size) }
          raise ArgumentError, "#{code} sample support does not match the simulation time axis."
        end
        write_csv(folder, name) do |csv|
          csv << ['Timestamp'] + ids
          csv << [nil] + Array.new(ids.size, csv_value(unit))
          (first..last).each do |index|
            csv << [times[index]] + data.map do |values|
              value = values.nil? ? nil : values[index]
              raise ArgumentError, "A #{code} sample is not numeric." unless value.nil? || value.is_a?(Numeric)
              csv_value(value)
            end
          end
        end
        completed << [name, table, code, unit, ids.size, last - first + 1, times[first], times[last]]
      end
    end
    raise ArgumentError, 'No supported result attributes were available for the selected objects.' if completed.empty?
    write_csv(folder, 'result_sources.csv') do |csv|
      csv << %w[file table attribute unit assets samples first_project_time last_project_time simulation model_revision scenario event datum]
      completed.each do |row|
        csv << row + details.values_at(:simulation, :revision, :scenario, :event, :datum).map { |value| csv_value(value) }
      end
    end
  end

  def self.prompt(job, result_job)
    rows = [
      ['Local output folder', 'String', nil, nil, 'FOLDER', 'Folder'],
      ['Object scope (selected or all)', 'String', 'selected'],
      ['Confirmed source units against ICM fields', 'Boolean', false],
      ['Model revision', 'String', ''],
      ['Scenario reviewed in the active network', 'String', '']
    ]
    if result_job
      rows += [ ['Simulation ID', 'String', ''], ['Event or run period', 'String', ''],
                ['Vertical datum (state reference used)', 'String', ''], ['Clock basis', 'String', 'calendar'],
                ['Origin for elapsed-seconds', 'String', ''], ['Start sample (optional)', 'String', ''], ['End sample (optional)', 'String', ''] ]
    end
    WSApplication.prompt("Hydra Bench #{job.to_s.tr('_', ' ')} export v#{VERSION}", rows, false)
  end

  def self.run(job, options = {})
    result_job = RESULT_PROFILES.key?(job)
    raise ArgumentError, 'Run this script in the InfoWorks ICM desktop UI.' unless defined?(WSApplication)
    net = WSApplication.current_network
    raise ArgumentError, 'Open the InfoWorks network in GeoPlan before running the export.' unless net
    answers = prompt(job, result_job)
    return puts('Export cancelled.') unless answers
    directory = required_text(answers[0], 'an existing local output folder')
    raise ArgumentError, 'Choose an existing local disk folder. Network share paths are unsupported.' if directory.match?(/\A[\/\\]{2}/) || !Dir.exist?(directory)
    scope = answers[1].to_s.strip.downcase
    raise ArgumentError, 'Choose selected or all object scope.' unless %w[selected all].include?(scope)
    raise ArgumentError, 'Confirm the source units before exporting.' unless answers[2] == true
    details = { :revision => required_text(answers[3], 'the model revision'), :scenario => required_text(answers[4], 'the scenario') }
    if result_job
      [:simulation, :event, :datum, :clock].each_with_index do |key, index|
        details[key] = required_text(answers[5 + index], key.to_s)
      end
      [:origin, :from, :to].each_with_index { |key, index| details[key] = answers[9 + index].to_s.strip }
    end
    name = "hydra_#{job}_#{Time.now.utc.strftime('%Y%m%dT%H%M%S%L')}"
    folder = File.join(File.realpath(directory), name)
    Dir.mkdir(folder)
    if result_job
      write_results(net, folder, job, scope, options, details)
    elsif job == :geometry
      geometry(net, folder, scope, options)
    elsif job == :formula_a
      catchments(net, folder, scope, options)
    else
      raise ArgumentError, 'Choose a supported toolkit export.'
    end
    write_csv(folder, 'hydra_export_complete.csv') do |csv|
      csv << %w[toolkit_version schema_version workflow model_revision scenario scope]
      csv << [VERSION, 'hydra-icm-export-v1', job.to_s, csv_value(details[:revision]), csv_value(details[:scenario]), scope]
    end
    puts "Export complete. Output folder: #{folder}"
    true
  rescue StandardError => error
    puts "Export could not finish. #{error.message}"
    puts 'Use a folder containing hydra_export_complete.csv for assessment.'
    false
  end
end
